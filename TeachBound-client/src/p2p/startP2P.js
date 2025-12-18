import { createLibp2p } from 'libp2p'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { webRTC } from '@libp2p/webrtc'
import { webSockets } from '@libp2p/websockets'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { multiaddr } from '@multiformats/multiaddr'
import {
  P2P_EVENT_TYPES,
  createDedupeCache,
  createEnvelope,
  decodeEnvelope,
  encodeEnvelope
} from './protocol'

export const DEFAULT_P2P_TOPIC = 'teachbound/whiteboard'

// Module-level singleton state
let _nodePromise = null
let _node = null
let _onMessage = new Set()
let _onEvent = new Set()
let _removeMessageListener = null
let _stopTimer = null
let _dedupe = createDedupeCache()
let _currentTopic = DEFAULT_P2P_TOPIC
let _currentRoom = null
let _relayAddr = null

function _clearStopTimer() {
  if (_stopTimer != null) {
    clearTimeout(_stopTimer)
    _stopTimer = null
  }
}

/**
 * Attach pubsub message listener and dispatch to registered callbacks.
 */
function _attachPubsubListener(node) {
  const handler = (evt) => {
    const { topic, data, from } = evt.detail
    const text = new TextDecoder().decode(data)
    let envelope = null

    try {
      envelope = decodeEnvelope(data)
    } catch {
      // Not a valid envelope - raw message
    }

    if (envelope?.id) {
      // Deduplicate by envelope ID
      if (_dedupe.has(envelope.id)) {
        // Already seen (self-loop or gossipsub duplicate)
        for (const cb of _onMessage) cb({ topic, from, data, text, envelope })
        return
      }

      _dedupe.add(envelope.id)

      const normalized = {
        ...envelope,
        from: from ?? envelope.from ?? null,
        topic
      }

      console.log(`[P2P ${topic}] ${normalized.type} from ${normalized.from}`)
      for (const cb of _onEvent) cb(normalized)
      for (const cb of _onMessage) cb({ topic, from, data, text, envelope })
      return
    }

    // Raw message (no envelope)
    console.log(`[P2P ${topic}] from ${from}: ${text}`)
    for (const cb of _onMessage) cb({ topic, from, data, text, envelope })
  }

  node.services.pubsub.addEventListener('message', handler)
  return () => node.services.pubsub.removeEventListener('message', handler)
}

/**
 * Create and start a libp2p node with WebRTC + WebSocket + Circuit Relay.
 */
async function _createNode(relayMultiaddr) {
  const node = await createLibp2p({
    transports: [
      webSockets({
        // Allow all WebSocket connections (needed for local dev with ws://)
        filter: () => true
      }),
      webRTC(),
      circuitRelayTransport({
        discoverRelays: 1
      })
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({
        emitSelf: false,
        allowPublishToZeroTopicPeers: true,
        // D and Dlo for small networks
        D: 4,
        Dlo: 2,
        Dhi: 8
      })
    },
    connectionManager: {
      maxConnections: 50,
      minConnections: 0
    },
    // Allow connections to local/insecure addresses for development
    connectionGater: {
      denyDialMultiaddr: () => false
    }
  })

  await node.start()

  console.log('[P2P] Node started, peer ID:', node.peerId.toString())

  // Connect to the relay/bootstrap node
  if (relayMultiaddr) {
    try {
      const ma = multiaddr(relayMultiaddr)
      console.log('[P2P] Connecting to relay:', relayMultiaddr)
      await node.dial(ma)
      console.log('[P2P] Connected to relay')
    } catch (err) {
      console.error('[P2P] Failed to connect to relay:', err)
    }
  }

  // Log peer events
  node.addEventListener('peer:connect', (evt) => {
    console.log('[P2P] Peer connected:', evt.detail.toString())
  })

  node.addEventListener('peer:disconnect', (evt) => {
    console.log('[P2P] Peer disconnected:', evt.detail.toString())
  })

  _removeMessageListener = _attachPubsubListener(node)

  return node
}

/**
 * Start (or reuse) the singleton libp2p node.
 *
 * @param {string} relayAddr - Multiaddr of the relay/bootstrap node (e.g., /ip4/127.0.0.1/tcp/9090/ws/p2p/<peer-id>)
 * @param {object} opts - Options
 * @param {string} opts.topic - Pubsub topic (default: teachbound/whiteboard)
 * @param {function} opts.onMessage - Raw message callback
 * @param {function} opts.onEvent - Envelope event callback
 * @param {boolean} opts.publishHello - Publish a hello message on connect (default: true)
 */
export async function startP2P(relayAddr, opts = {}) {
  const { topic = DEFAULT_P2P_TOPIC, onMessage, onEvent, publishHello = true } = opts

  if (onMessage) _onMessage.add(onMessage)
  if (onEvent) _onEvent.add(onEvent)

  // Cancel any scheduled stop
  _clearStopTimer()

  // Return existing node if already started
  if (_nodePromise) return _nodePromise

  _relayAddr = relayAddr
  _nodePromise = (async () => {
    _currentTopic = topic
    _currentRoom =
      typeof opts.room === 'string'
        ? opts.room
        : topic.startsWith('teachbound/')
          ? topic.slice('teachbound/'.length)
          : null

    _node = await _createNode(relayAddr)

    // Subscribe to topic
    _node.services.pubsub.subscribe(topic)
    console.log(`[P2P] Subscribed to topic: ${topic}`)

    // Send hello message
    if (publishHello) {
      // Small delay to allow connections to establish
      setTimeout(() => {
        publishP2PEvent(P2P_EVENT_TYPES.DEBUG_HELLO, {
          text: 'hello from TeachBound client'
        })
      }, 1000)
    }

    return _node
  })()

  return _nodePromise
}

/**
 * Get the current libp2p node (or null if not started).
 */
export function getP2PNode() {
  return _node
}

/**
 * Publish an event to the current topic.
 */
export function publishP2PEvent(type, payload, opts = {}) {
  if (!_node) {
    console.warn('[P2P] Cannot publish: node not started')
    return null
  }

  const topic = opts.topic ?? _currentTopic
  const room = opts.room ?? _currentRoom

  const envelope = createEnvelope({
    room,
    type,
    payload,
    from: _node.peerId?.toString?.() ?? String(_node.peerId)
  })

  // Mark as seen to prevent self-loop
  _dedupe.add(envelope.id)

  _node.services.pubsub.publish(topic, encodeEnvelope(envelope)).catch((err) => {
    // Expected when no peers yet
    console.debug('[P2P] publish failed:', err.message || err)
  })

  return envelope
}

/**
 * Add a listener for structured P2P events.
 * Returns an unsubscribe function.
 */
export function addP2PEventListener(cb) {
  _onEvent.add(cb)
  return () => _onEvent.delete(cb)
}

/**
 * Stop the P2P node immediately.
 */
export async function stopP2P() {
  _clearStopTimer()

  const node = await _nodePromise?.catch(() => null)
  _nodePromise = null
  _node = null
  _onMessage = new Set()
  _onEvent = new Set()
  _dedupe.clear()
  _currentTopic = DEFAULT_P2P_TOPIC
  _currentRoom = null
  _relayAddr = null

  if (!node) return

  try {
    _removeMessageListener?.()
  } finally {
    _removeMessageListener = null
  }

  await node.stop()
  console.log('[P2P] Node stopped')
}

/**
 * Schedule stopping the node after a delay.
 * Useful for React StrictMode double-mount handling.
 */
export function scheduleStopP2P(delayMs = 0) {
  _clearStopTimer()
  _stopTimer = setTimeout(() => {
    stopP2P().catch((err) => console.error('[P2P] stop failed:', err))
  }, delayMs)
}

// Re-export for convenience
export { P2P_EVENT_TYPES } from './protocol'
export { generateElementId } from '../utils/ids'

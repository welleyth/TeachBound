import { createLibp2p } from 'libp2p'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { webRTCStar } from '@libp2p/webrtc-star'
import { webSockets } from '@libp2p/websockets'
import { multiaddr } from '@multiformats/multiaddr'

export const DEFAULT_P2P_TOPIC = 'teachbound/test'

let _nodePromise = null
let _node = null
let _onMessage = new Set()
let _removeMessageListener = null
let _removePeerDiscoveryListener = null

function _attachPubsubListener(node) {
  const handler = (evt) => {
    const { topic, data, from } = evt.detail
    const text = new TextDecoder().decode(data)
    console.log(`[P2P ${topic}] from ${from}: ${text}`)
    for (const cb of _onMessage) cb({ topic, from, data, text })
  }
  node.services.pubsub.addEventListener('message', handler)
  return () => node.services.pubsub.removeEventListener('message', handler)
}

function _attachAutoDialOnDiscovery(node) {
  const dialed = new Set()

  const handler = (evt) => {
    const detail = evt.detail
    const peerId = detail?.id ?? detail
    if (!peerId) return

    const peerIdStr = peerId.toString()
    if (peerIdStr === node.peerId.toString()) return
    if (dialed.has(peerIdStr)) return
    dialed.add(peerIdStr)

    const firstAddr = Array.isArray(detail?.multiaddrs) ? detail.multiaddrs[0] : null
    const dialTarget = firstAddr ?? peerId

    node.dial(dialTarget).catch((err) => {
      console.debug('[P2P] auto-dial failed', peerIdStr, err)
    })
  }

  node.addEventListener('peer:discovery', handler)
  return () => node.removeEventListener('peer:discovery', handler)
}

async function _createNode(libp2pOverrides = {}) {
  const { services: servicesOverride, ...restOverrides } = libp2pOverrides

  const node = await createLibp2p({
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub(),
      ...(servicesOverride ?? {})
    },
    ...restOverrides
  })

  await node.start()
  _removeMessageListener = _attachPubsubListener(node)
  return node
}

/**
 * Start (or reuse) a singleton libp2p node.
 *
 * Topology:
 * - If `bootstrapAddr` is a webrtc-star signalling multiaddr (contains `p2p-webrtc-star`),
 *   we start libp2p with the WebRTC-Star transport + discovery and auto-dial discovered peers.
 * - Otherwise we fall back to the old demo mode (dial a known host over WebSockets).
 */
export async function startP2P(bootstrapAddr, opts = {}) {
  const { topic = DEFAULT_P2P_TOPIC, onMessage, publishHello = true } = opts
  if (onMessage) _onMessage.add(onMessage)

  if (_nodePromise) return _nodePromise

  _nodePromise = (async () => {
    const isWebRTCStar = typeof bootstrapAddr === 'string' && bootstrapAddr.includes('p2p-webrtc-star')

    if (isWebRTCStar) {
      const star = webRTCStar()
      _node = await _createNode({
        addresses: {
          listen: [bootstrapAddr]
        },
        transports: [star.transport],
        peerDiscovery: [star.discovery]
      })
      _removePeerDiscoveryListener = _attachAutoDialOnDiscovery(_node)
    } else {
      // Legacy ws-host demo mode
      _node = await _createNode({
        transports: [webSockets()]
      })

      if (bootstrapAddr) {
        // подключаемся к хосту
        await _node.dial(multiaddr(bootstrapAddr))
      }
    }

    // “комната”
    _node.services.pubsub.subscribe(topic)

    // тестовое сообщение (smoke test)
    if (publishHello) {
      _node.services.pubsub.publish(
        topic,
        new TextEncoder().encode('hello from TeachBound client')
      )
    }

    return _node
  })()

  return _nodePromise
}

export function getP2PNode() {
  return _node
}

export async function stopP2P() {
  // If start never succeeded, still clear state.
  const node = await _nodePromise?.catch(() => null)
  _nodePromise = null
  _node = null
  _onMessage = new Set()

  if (!node) return
  try {
    _removeMessageListener?.()
    _removePeerDiscoveryListener?.()
  } finally {
    _removeMessageListener = null
    _removePeerDiscoveryListener = null
  }
  await node.stop()
}

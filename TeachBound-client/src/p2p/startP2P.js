import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { webRTCStar } from '@libp2p/webrtc-star';
import { webSockets } from '@libp2p/websockets';
import { multiaddr } from '@multiformats/multiaddr';
import {
  P2P_EVENT_TYPES,
  createDedupeCache,
  createEnvelope,
  decodeEnvelope,
  encodeEnvelope,
} from './protocol';

export const DEFAULT_P2P_TOPIC = 'teachbound/test';

let _nodePromise = null;
let _node = null;
let _onMessage = new Set();
let _onEvent = new Set();
let _removeMessageListener = null;
let _removePeerDiscoveryListener = null;
let _stopTimer = null;
let _dedupe = createDedupeCache();
let _currentTopic = DEFAULT_P2P_TOPIC;
let _currentRoom = null;

function _clearStopTimer() {
  if (_stopTimer != null) {
    clearTimeout(_stopTimer);
    _stopTimer = null;
  }
}

function _attachPubsubListener(node) {
  const handler = (evt) => {
    const { topic, data, from } = evt.detail;
    const text = new TextDecoder().decode(data);
    let envelope = null;
    try {
      envelope = decodeEnvelope(data);
    } catch {
      // Not an envelope (or invalid) - keep raw logging/callbacks only.
    }

    if (envelope?.id) {
      if (_dedupe.has(envelope.id)) {
        // Likely a self-loop or a gossipsub duplicate - ignore at protocol level.
        for (const cb of _onMessage) cb({ topic, from, data, text, envelope });
        return;
      }

      _dedupe.add(envelope.id);

      const normalized = {
        ...envelope,
        // Prefer the actual libp2p sender id for routing/diagnostics.
        from: from ?? envelope.from ?? null,
        topic,
      };

      console.log(`[P2P ${topic}] ${normalized.type} from ${normalized.from}`);
      for (const cb of _onEvent) cb(normalized);
      for (const cb of _onMessage) cb({ topic, from, data, text, envelope });
      return;
    }

    console.log(`[P2P ${topic}] from ${from}: ${text}`);

    for (const cb of _onMessage) cb({ topic, from, data, text, envelope });
  };
  node.services.pubsub.addEventListener('message', handler);
  return () => node.services.pubsub.removeEventListener('message', handler);
}

function _attachAutoDialOnDiscovery(node) {
  const dialed = new Set();

  const handler = (evt) => {
    const detail = evt.detail;
    const peerId = detail?.id ?? detail;
    if (!peerId) return;

    const peerIdStr = peerId.toString();
    if (peerIdStr === node.peerId.toString()) return;
    if (dialed.has(peerIdStr)) return;
    dialed.add(peerIdStr);

    const firstAddr = Array.isArray(detail?.multiaddrs) ? detail.multiaddrs[0] : null;
    const dialTarget = firstAddr ?? peerId;

    node.dial(dialTarget).catch((err) => {
      console.debug('[P2P] auto-dial failed', peerIdStr, err);
    });
  };

  node.addEventListener('peer:discovery', handler);
  return () => node.removeEventListener('peer:discovery', handler);
}

async function _createNode(libp2pOverrides = {}) {
  const { services: servicesOverride, ...restOverrides } = libp2pOverrides;

  const node = await createLibp2p({
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub(),
      ...(servicesOverride ?? {}),
    },
    ...restOverrides,
  });

  await node.start();
  _removeMessageListener = _attachPubsubListener(node);
  return node;
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
  const { topic = DEFAULT_P2P_TOPIC, onMessage, onEvent, publishHello = true } = opts;
  if (onMessage) _onMessage.add(onMessage);
  if (onEvent) _onEvent.add(onEvent);

  // If a stop was scheduled (e.g. React StrictMode cleanup), cancel it.
  _clearStopTimer();

  if (_nodePromise) return _nodePromise;

  _nodePromise = (async () => {
    _currentTopic = topic;
    _currentRoom =
      typeof opts.room === 'string'
        ? opts.room
        : topic.startsWith('teachbound/')
          ? topic.slice('teachbound/'.length)
          : null;

    const isWebRTCStar =
      typeof bootstrapAddr === 'string' && bootstrapAddr.includes('p2p-webrtc-star');

    if (isWebRTCStar) {
      const star = webRTCStar();
      _node = await _createNode({
        addresses: {
          listen: [bootstrapAddr],
        },
        transports: [star.transport],
        peerDiscovery: [star.discovery],
      });
      _removePeerDiscoveryListener = _attachAutoDialOnDiscovery(_node);
    } else {
      // Legacy ws-host demo mode
      _node = await _createNode({
        transports: [webSockets()],
      });

      if (bootstrapAddr) {
        // подключаемся к хосту
        await _node.dial(multiaddr(bootstrapAddr));
      }
    }

    // “комната”
    _node.services.pubsub.subscribe(topic);

    // тестовое сообщение (smoke test)
    if (publishHello) {
      publishP2PEvent(P2P_EVENT_TYPES.DEBUG_HELLO, {
        text: 'hello from TeachBound client',
      });
    }

    return _node;
  })();

  return _nodePromise;
}

export function getP2PNode() {
  return _node;
}

export function publishP2PEvent(type, payload, opts = {}) {
  if (!_node) throw new Error('P2P node is not started');
  const topic = opts.topic ?? _currentTopic;
  const room = opts.room ?? _currentRoom;

  const envelope = createEnvelope({
    room,
    type,
    payload,
    from: _node.peerId?.toString?.() ?? String(_node.peerId),
  });

  // Mark as seen so we don't re-process our own event if it is looped back to us.
  _dedupe.add(envelope.id);

  _node.services.pubsub.publish(topic, encodeEnvelope(envelope));
  return envelope;
}

export function addP2PEventListener(cb) {
  _onEvent.add(cb);
  return () => _onEvent.delete(cb);
}

export async function stopP2P() {
  _clearStopTimer();

  // If start never succeeded, still clear state.
  const node = await _nodePromise?.catch(() => null);
  _nodePromise = null;
  _node = null;
  _onMessage = new Set();
  _onEvent = new Set();
  _dedupe.clear();
  _currentTopic = DEFAULT_P2P_TOPIC;
  _currentRoom = null;

  if (!node) return;
  try {
    _removeMessageListener?.();
    _removePeerDiscoveryListener?.();
  } finally {
    _removeMessageListener = null;
    _removePeerDiscoveryListener = null;
  }
  await node.stop();
}

/**
 * Schedule stopping the singleton node after `delayMs`.
 * This is useful for React StrictMode double-mount in dev: cleanup schedules a stop,
 * the immediate remount cancels it by calling `startP2P`.
 */
export function scheduleStopP2P(delayMs = 0) {
  _clearStopTimer();
  _stopTimer = setTimeout(() => {
    stopP2P().catch((err) => console.error('[P2P] stop failed', err));
  }, delayMs);
}

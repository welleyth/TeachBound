import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { multiaddr } from '@multiformats/multiaddr'

export const DEFAULT_P2P_TOPIC = 'teachbound/test'

let _nodePromise = null
let _node = null
let _onMessage = new Set()
let _removeMessageListener = null

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

async function _createNode() {
  const node = await createLibp2p({
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub()
    }
  })

  await node.start()
  _removeMessageListener = _attachPubsubListener(node)
  return node
}

/**
 * Start (or reuse) a singleton libp2p node.
 *
 * Current (temporary) topology: browser dials a known host multiaddr over WebSockets.
 * Step 2 will replace this with browser↔browser connectivity.
 */
export async function startP2P(hostAddr, opts = {}) {
  const { topic = DEFAULT_P2P_TOPIC, onMessage, publishHello = true } = opts
  if (onMessage) _onMessage.add(onMessage)

  if (_nodePromise) return _nodePromise

  _nodePromise = (async () => {
    _node = await _createNode()

    if (hostAddr) {
      // подключаемся к хосту
      await _node.dial(multiaddr(hostAddr))
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
  } finally {
    _removeMessageListener = null
  }
  await node.stop()
}

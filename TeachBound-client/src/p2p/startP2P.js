import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@chainsafe/libp2p-identify'
import { multiaddr } from '@multiformats/multiaddr'

const TOPIC = 'teachbound/test'

export async function startP2P(hostAddr) {
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

  node.services.pubsub.addEventListener('message', (evt) => {
    const { topic, data, from } = evt.detail
    console.log(`[P2P ${topic}] from ${from}: ${new TextDecoder().decode(data)}`)
  })

  // подключаемся к хосту
  await node.dial(multiaddr(hostAddr))

  // “комната”
  node.services.pubsub.subscribe(TOPIC)

  // тестовое сообщение
  node.services.pubsub.publish(TOPIC, new TextEncoder().encode('hello from TeachBound client'))

  return node
}

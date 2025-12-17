import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'

const TOPIC = 'teachbound/test'

const node = await createLibp2p({
  addresses: {
    // фиксированный порт для простого теста
    listen: ['/ip4/0.0.0.0/tcp/15555/ws']
  },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: {
    identify: identify(),
    pubsub: gossipsub()
  }
})

await node.start()

console.log('Host peer started:', node.peerId.toString())
console.log('Listening on:')
node.getMultiaddrs().forEach((ma) => console.log(ma.toString()))

node.services.pubsub.addEventListener('message', (evt) => {
  const { topic, data, from } = evt.detail
  console.log(`[${topic}] from ${from}: ${new TextDecoder().decode(data)}`)
})

await node.services.pubsub.subscribe(TOPIC)
console.log('Subscribed to:', TOPIC)

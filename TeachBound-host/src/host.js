import { createLibp2p } from 'libp2p'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { floodsub } from '@libp2p/floodsub'
import { identify } from '@libp2p/identify'
import { webSockets } from '@libp2p/websockets'
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'

const PORT = process.env.PORT || 9090

async function main() {
  const node = await createLibp2p({
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${PORT}/ws`]
    },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      // Use floodsub for simpler messaging (broadcasts to all peers)
      pubsub: floodsub(),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: 128,
          reservationTtl: 120000,
          defaultDataLimit: BigInt(1 << 20) // 1MB
        }
      })
    },
    connectionManager: {
      maxConnections: 100,
      minConnections: 0
    }
  })

  await node.start()

  console.log('[TeachBound-host] Relay node started')
  console.log('[TeachBound-host] Peer ID:', node.peerId.toString())
  console.log('[TeachBound-host] Listening on:')
  console.log(`  /ip4/0.0.0.0/tcp/${PORT}/ws/p2p/${node.peerId.toString()}`)
  console.log(`  /ip4/127.0.0.1/tcp/${PORT}/ws/p2p/${node.peerId.toString()}`)
  console.log('')
  console.log('[TeachBound-host] For client .env:')
  console.log(`  REACT_APP_P2P_RELAY_ADDR=/ip4/127.0.0.1/tcp/${PORT}/ws/p2p/${node.peerId.toString()}`)

  // Log peer connections
  node.addEventListener('peer:connect', (evt) => {
    console.log('[TeachBound-host] Peer connected:', evt.detail.toString())
  })

  node.addEventListener('peer:disconnect', (evt) => {
    console.log('[TeachBound-host] Peer disconnected:', evt.detail.toString())
  })

  // Subscribe to common topics to relay messages
  const TOPICS = ['teachbound/whiteboard', 'teachbound/demo', 'teachbound/test']
  for (const topic of TOPICS) {
    node.services.pubsub.subscribe(topic)
    console.log(`[TeachBound-host] Subscribed to topic: ${topic}`)
  }

  // Log messages (for debugging)
  node.services.pubsub.addEventListener('message', (evt) => {
    const { topic, from } = evt.detail
    console.log(`[TeachBound-host] Message on ${topic} from ${from}`)
  })

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[TeachBound-host] Shutting down...')
    await node.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[TeachBound-host] Failed to start:', err)
  process.exit(1)
})

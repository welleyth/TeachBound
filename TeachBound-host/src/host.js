import { sigServer } from '@libp2p/webrtc-star-signalling-server'

const host = process.env.P2P_SIGNALING_HOST ?? '0.0.0.0'
const port = Number(process.env.P2P_SIGNALING_PORT ?? process.env.PORT ?? 9090)

const server = await sigServer({
  host,
  port,
  metrics: false
})

console.log('[TeachBound-host] WebRTC-star signalling server started')
console.log(`[TeachBound-host] Listening on ${host}:${port}`)

// The signalling server binds to 0.0.0.0, but clients must dial a real interface address.
const dialHost = host === '0.0.0.0' ? '127.0.0.1' : host
console.log('[TeachBound-host] Client multiaddr (local dev):')
console.log(`  /ip4/${dialHost}/tcp/${port}/ws/p2p-webrtc-star`)
console.log('[TeachBound-host] Hosted demo signalling servers (not for production):')
console.log('  /dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star')
console.log('  /dns4/wrtc-star2.sjc.dwebops.pub/tcp/443/wss/p2p-webrtc-star')

async function shutdown() {
  try {
    console.log('\n[TeachBound-host] Stopping signalling server...')
    await server.stop()
  } finally {
    process.exit(0)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

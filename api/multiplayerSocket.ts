import { io, type Socket } from 'socket.io-client'

let singleton: Socket | null = null

function resolveSocketUrl(): string | undefined {
  const raw = import.meta.env.VITE_API_URL as string | undefined
  if (!raw) return undefined

  // axios baseURL is often like "http://localhost:8000/api"
  // socket.io usually lives on the host root.
  if (raw.endsWith('/api')) return raw.slice(0, -4)
  return raw
}

export function getMultiplayerSocket(): Socket {
  if (singleton) return singleton

  const socketUrl = resolveSocketUrl()

  singleton = io(socketUrl || undefined, {
    transports: ['websocket'],
    withCredentials: true,
    // Wait for explicit connect implicitly; socket.io-client starts connecting immediately by default.
    autoConnect: true,
  })

  return singleton
}

export function disconnectMultiplayerSocket() {
  singleton?.disconnect()
  singleton = null
}


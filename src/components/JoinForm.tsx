import { useState, type FormEvent } from 'react'

interface JoinFormProps {
  onJoin: (roomId: string) => void
}

export default function JoinForm({ onJoin }: JoinFormProps) {
  const [roomId, setRoomId] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (roomId.trim()) {
      onJoin(roomId.trim())
    }
  }

  return (
    <section className="h-full flex justify-center items-center relative overflow-hidden">
      {/* Background gradient accents */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-electric/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-electric/5 rounded-full blur-3xl" />
      </div>

      {/* Card */}
      <div className="relative z-10 p-10 w-full max-w-md mx-4 bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-bold text-paper mb-3">
            Group Video Chat
          </h1>
          <p className="text-fog text-sm mb-4">
            Connect face-to-face with secure peer-to-peer video
          </p>
          
          {/* Status badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs font-mono">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-fog">Peer-to-peer</span>
            <span className="text-fog/50">•</span>
            <span className="text-fog">WebRTC</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-6">
          <div>
            <label htmlFor="roomId" className="block text-sm font-medium text-fog mb-2">
              Enter Room ID
            </label>
            <input
              id="roomId"
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg outline-none text-base text-paper placeholder:text-fog/40 focus:border-electric focus:ring-2 focus:ring-electric/20 transition-all"
              autoComplete="off"
              placeholder="my-room-123"
              required
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="w-full bg-electric text-white font-semibold py-3 px-6 rounded-lg transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] shadow-lg hover:shadow-glow-electric"
          >
            Join Room
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-fog/60">
          Share your room ID with others to start a group call
        </p>
      </div>
    </section>
  )
}

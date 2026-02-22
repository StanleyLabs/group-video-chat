import { useState } from 'react'
import JoinForm from './components/JoinForm'
import VideoChat from './components/VideoChat'

function App() {
  const [roomId, setRoomId] = useState<string | null>(null)

  const handleJoinRoom = (room: string) => {
    setRoomId(room)
  }

  const handleLeaveRoom = () => {
    setRoomId(null)
  }

  return (
    <div className="h-full flex flex-col bg-ink grain overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-white/10 bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-display font-semibold text-paper">
            Stanley Labs
          </h1>
          <div className="text-sm text-fog font-mono">Group Video Chat</div>
        </div>
      </header>

      {/* Main content - fills remaining space, no overflow */}
      <main className="flex-1 min-h-0">
        {!roomId ? (
          <JoinForm onJoin={handleJoinRoom} />
        ) : (
          <VideoChat roomId={roomId} onLeave={handleLeaveRoom} />
        )}
      </main>
    </div>
  )
}

export default App

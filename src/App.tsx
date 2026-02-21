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
    <div className="min-h-screen bg-ink grain">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-ink/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-display font-semibold text-paper">
            Stanley Labs
          </h1>
          <div className="text-sm text-fog font-mono">Group Video Chat</div>
        </div>
      </header>

      {/* Main content */}
      <div className="pt-16">
        {!roomId ? (
          <JoinForm onJoin={handleJoinRoom} />
        ) : (
          <VideoChat roomId={roomId} onLeave={handleLeaveRoom} />
        )}
      </div>
    </div>
  )
}

export default App

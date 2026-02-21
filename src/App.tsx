import { useState } from 'react'
import JoinForm from './components/JoinForm'
import VideoChat from './components/VideoChat'

function App() {
  const [roomId, setRoomId] = useState<string | null>(null)

  const handleJoinRoom = (room: string) => {
    setRoomId(room)
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {!roomId ? (
        <JoinForm onJoin={handleJoinRoom} />
      ) : (
        <VideoChat roomId={roomId} />
      )}
    </div>
  )
}

export default App

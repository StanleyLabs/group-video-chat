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
    <section className="w-screen h-screen flex justify-center items-center bg-gray-900">
      <div className="p-10 w-96 lg:w-1/4 bg-white rounded flex justify-center items-center flex-col shadow-md">
        <form onSubmit={handleSubmit} className="w-full">
          <p className="float-left w-full pb-2 text-gray-800">Enter Room ID</p>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="mb-5 p-3 w-full focus:border-purple-700 rounded border-2 outline-none text-gray-800"
            autoComplete="off"
            placeholder="Room ID"
            required
            autoFocus
          />
          <button
            type="submit"
            className="w-full bg-purple-600 hover:bg-purple-900 text-white font-bold p-2 rounded transition-colors"
          >
            Join Room
          </button>
        </form>
      </div>
    </section>
  )
}

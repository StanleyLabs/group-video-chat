import { useRef, useCallback, useEffect } from 'react'
import { useMachine } from '@xstate/react'
import { roomMachine } from '../machines/roomMachine'
import { useWebRTC } from '../hooks/useWebRTC'
import { useDevices } from '../hooks/useDevices'
import { useDraggable } from '../hooks/useDraggable'
import { getGridClasses } from '../utils/gridLayout'
import PeerVideo from './PeerVideo'
import LocalVideo from './LocalVideo'
import ControlsBar from './ControlsBar'

interface VideoChatProps {
  roomId: string
  onLeave: () => void
}

export default function VideoChat({ roomId, onLeave }: VideoChatProps) {
  const [state, send] = useMachine(roomMachine, { input: { roomId } })
  const { localStream, peerList, spotlightPeerId, isAudioMuted, isVideoMuted, error } = state.context

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const pipRef = useRef<HTMLDivElement>(null)

  useDraggable(pipRef)

  // Request media on mount
  const isRequestingMedia = state.matches('requestingMedia')
  useEffect(() => {
    if (!isRequestingMedia) return
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        send({ type: 'MEDIA_READY', stream })
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
          localVideoRef.current.muted = true
          localVideoRef.current.volume = 0
        }
      })
      .catch(err => {
        if (!cancelled) send({ type: 'MEDIA_ERROR', error: err.message })
      })
    return () => { cancelled = true }
  }, [isRequestingMedia, send])

  // WebRTC signaling
  const onPeerAdded = useCallback((peerId: string, stream: MediaStream) => {
    send({ type: 'PEER_ADDED', peerId, stream })
  }, [send])

  const onPeerRemoved = useCallback((peerId: string) => {
    send({ type: 'PEER_REMOVED', peerId })
  }, [send])

  const onConnected = useCallback(() => {
    send({ type: 'SOCKET_CONNECTED' })
  }, [send])

  const onDisconnected = useCallback(() => {
    send({ type: 'SOCKET_DISCONNECTED' })
  }, [send])

  const { replaceTrackInPeers } = useWebRTC({
    roomId,
    localStream,
    onConnected,
    onDisconnected,
    onPeerAdded,
    onPeerRemoved,
  })

  // Device management
  const onTrackReplaced = useCallback(async (kind: 'audio' | 'video', track: MediaStreamTrack) => {
    await replaceTrackInPeers(kind, track)
    if (kind === 'video' && localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [replaceTrackInPeers, localStream])

  const devices = useDevices({ localStream, onTrackReplaced })

  // Derived state
  const peerCount = peerList.length
  const isConnected = state.matches('connected')
  const spotlightPeer = peerList.find(p => p.id === spotlightPeerId)
  const thumbPeers = spotlightPeerId ? peerList.filter(p => p.id !== spotlightPeerId) : []

  const handleLeave = () => {
    send({ type: 'LEAVE' })
    onLeave()
  }

  if (state.matches('error')) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-signal text-lg font-semibold mb-2">Camera/Mic Error</div>
          <div className="text-fog text-sm">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* Device change toast */}
      {devices.showToast && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] bg-yellow-400 text-gray-900 text-sm font-medium px-4 py-1.5 rounded-full shadow-lg animate-pulse">
          Devices updated - check settings
        </div>
      )}

      {/* Top bar */}
      <TopBar
        roomId={roomId}
        isConnected={isConnected}
        peerCount={peerCount}
        onLeave={handleLeave}
      />

      {/* Main video area */}
      <div className="flex-1 min-h-0 p-4 overflow-hidden flex flex-col">
        <div className="w-full h-[70vh] flex flex-col justify-center">
          {peerCount === 0 ? (
            <div className="text-center py-12">
              <div className="text-fog/60 text-sm font-mono mb-2">
                {isConnected ? 'Waiting for others to join...' : 'Connecting...'}
              </div>
              <div className="text-fog/40 text-xs font-mono">
                Share room ID: <span className="text-electric">{roomId}</span>
              </div>
            </div>
          ) : spotlightPeerId && spotlightPeer ? (
            <div className="flex flex-col gap-2 min-h-0 h-full">
              <PeerVideo
                key={spotlightPeer.id}
                peerId={spotlightPeer.id}
                stream={spotlightPeer.stream}
                isSpotlight
                isThumb={false}
                onSelect={() => send({ type: 'SPOTLIGHT', peerId: null })}
              />
              {thumbPeers.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 shrink-0">
                  {thumbPeers.map(p => (
                    <PeerVideo
                      key={p.id}
                      peerId={p.id}
                      stream={p.stream}
                      isSpotlight={false}
                      isThumb
                      onSelect={() => send({ type: 'SPOTLIGHT', peerId: p.id })}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={`w-full h-full min-w-0 min-h-0 ${getGridClasses(peerCount)} `}>
              {peerList.map(p => (
                <PeerVideo
                  key={p.id}
                  peerId={p.id}
                  stream={p.stream}
                  isSpotlight={false}
                  isThumb={false}
                  onSelect={() => send({ type: 'SPOTLIGHT', peerId: p.id })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Local video pip */}
      <LocalVideo
        ref={pipRef}
        videoRef={localVideoRef}
        isVideoMuted={isVideoMuted}
      />

      {/* Controls */}
      <ControlsBar
        isAudioMuted={isAudioMuted}
        isVideoMuted={isVideoMuted}
        onToggleAudio={() => send({ type: 'TOGGLE_AUDIO' })}
        onToggleVideo={() => send({ type: 'TOGGLE_VIDEO' })}
        onLeave={handleLeave}
        devices={devices}
      />
    </div>
  )
}

/* ---- Sub-components ---- */

function TopBar({ roomId, isConnected, peerCount, onLeave }: {
  roomId: string
  isConnected: boolean
  peerCount: number
  onLeave: () => void
}) {
  return (
    <div className="shrink-0 border-b border-white/10 bg-graphite/50 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm sm:text-lg font-display font-semibold text-paper truncate">
            Room: <span className="text-electric font-mono">{roomId}</span>
          </h2>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full shrink-0">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-xs font-mono text-fog whitespace-nowrap">
              {isConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
          <span className="sm:hidden w-2 h-2 rounded-full shrink-0" style={{ background: isConnected ? '#22c55e' : '#6b7280' }} />
          {peerCount > 0 && (
            <div className="text-xs font-mono text-fog whitespace-nowrap shrink-0">
              {peerCount} {peerCount === 1 ? 'peer' : 'peers'}
            </div>
          )}
        </div>
        <button
          onClick={onLeave}
          className="shrink-0 px-4 py-2 bg-signal text-white font-medium rounded-lg transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] text-sm whitespace-nowrap"
        >
          Leave
        </button>
      </div>
    </div>
  )
}

import { useRef, useCallback, useEffect, useState, type RefObject } from 'react'
import { useMachine } from '@xstate/react'
import { roomMachine } from '../machines/roomMachine'
import { useWebRTC } from '../hooks/useWebRTC'
import { useDevices } from '../hooks/useDevices'
import { useDraggable } from '../hooks/useDraggable'
import { getGridClasses } from '../utils/gridLayout'
import PeerVideo from './PeerVideo'
import LocalVideo from './LocalVideo'
import ControlsBar from './ControlsBar'
import LeaveModal from './LeaveModal'

/**
 * Resizes a grid container so its columns tightly fit the actual video
 * content (accounting for object-contain letterboxing).
 * Observes the PARENT container (not the grid itself) to avoid feedback loops.
 */
function useGridFit(gridRef: RefObject<HTMLDivElement | null>, peerCount: number) {
  const rafRef = useRef(0)
  const fittedRef = useRef(false)

  useEffect(() => {
    const grid = gridRef.current
    const parent = grid?.parentElement
    if (!grid || !parent || peerCount === 0) return

    fittedRef.current = false
    grid.style.visibility = 'hidden'

    const recalc = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const video = grid.querySelector('video')
        if (!video || !video.videoWidth || !video.videoHeight) return

        const availH = parent.clientHeight
        const availW = parent.clientWidth
        if (!availH || !availW) return

        const style = getComputedStyle(grid)
        const cols = style.gridTemplateColumns.split(' ').length
        const rows = Math.ceil(peerCount / cols)
        const gap = parseFloat(style.gap) || 0

        const rowH = (availH - gap * (rows - 1)) / rows
        const videoAspect = video.videoWidth / video.videoHeight
        const cellW = rowH * videoAspect
        const idealW = cellW * cols + gap * (cols - 1)

        if (idealW < availW) {
          grid.style.maxWidth = `${idealW}px`
        } else {
          grid.style.maxWidth = ''
        }

        // Reveal on first successful fit
        if (!fittedRef.current) {
          fittedRef.current = true
          grid.style.visibility = ''
        }
      })
    }

    grid.addEventListener('loadedmetadata', recalc, true)

    const ro = new ResizeObserver(recalc)
    ro.observe(parent)

    recalc()

    return () => {
      cancelAnimationFrame(rafRef.current)
      grid.removeEventListener('loadedmetadata', recalc, true)
      ro.disconnect()
      grid.style.maxWidth = ''
      grid.style.visibility = ''
    }
  }, [gridRef, peerCount])
}

interface VideoChatProps {
  roomId: string
  onLeave: () => void
}

export default function VideoChat({ roomId, onLeave }: VideoChatProps) {
  const [state, send] = useMachine(roomMachine, { input: { roomId } })
  const { localStream, peerList, spotlightPeerId, isAudioMuted, isVideoMuted, error } = state.context

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const pipRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

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

  const onPeerName = useCallback((peerId: string, name: string) => {
    send({ type: 'PEER_NAME', peerId, name })
  }, [send])

  const onConnected = useCallback(() => {
    send({ type: 'SOCKET_CONNECTED' })
  }, [send])

  const onDisconnected = useCallback(() => {
    send({ type: 'SOCKET_DISCONNECTED' })
  }, [send])

  const { replaceTrackInPeers, sendName } = useWebRTC({
    roomId,
    localStream,
    onConnected,
    onDisconnected,
    onPeerAdded,
    onPeerRemoved,
    onPeerName,
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

  // Fit grid width to actual video content
  useGridFit(gridRef, spotlightPeerId ? 0 : peerCount)

  // Brief visibility hide on layout mode switch to prevent flicker
  const layoutRef = useRef<HTMLDivElement>(null)
  const prevModeRef = useRef<string | null>(null)
  const currentMode = spotlightPeerId ? 'spotlight' : 'grid'

  useEffect(() => {
    const el = layoutRef.current
    if (!el) return
    if (prevModeRef.current !== null && prevModeRef.current !== currentMode) {
      el.style.visibility = 'hidden'
      const raf = requestAnimationFrame(() => {
        // Reveal after one frame so the new layout has settled
        requestAnimationFrame(() => {
          el.style.visibility = ''
        })
      })
      return () => {
        cancelAnimationFrame(raf)
        el.style.visibility = ''
      }
    }
    prevModeRef.current = currentMode
  }, [currentMode])

  // Display name
  const [displayName, setDisplayName] = useState('')
  const [savedName, setSavedName] = useState('')
  const handleNameSave = useCallback(() => {
    const trimmed = displayName.trim()
    sendName(trimmed)
    setSavedName(trimmed)
    setDisplayName('')
  }, [sendName, displayName])

  // Leave confirmation (shared between top bar and controls bar)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

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
        displayName={displayName}
        savedName={savedName}
        onNameChange={setDisplayName}
        onNameEdit={() => { setDisplayName(savedName); setSavedName('') }}
        onNameSave={handleNameSave}
        onLeave={() => setShowLeaveConfirm(true)}
      />

      {/* Main video area */}
      <div className="flex-1 min-h-0 p-4 overflow-hidden flex flex-col">
        <div ref={layoutRef} className="w-full h-[70vh] flex flex-col justify-center">
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
                name={spotlightPeer.name}
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
                      name={p.name}
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
            <div ref={gridRef} className={`w-full h-full min-w-0 min-h-0 mx-auto ${getGridClasses(peerCount)} `}>
              {peerList.map(p => (
                <PeerVideo
                  key={p.id}
                  peerId={p.id}
                  name={p.name}
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
        onLeave={() => setShowLeaveConfirm(true)}
        devices={devices}
      />

      {showLeaveConfirm && (
        <LeaveModal
          onConfirm={handleLeave}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
    </div>
  )
}

/* ---- Sub-components ---- */

function TopBar({ roomId, isConnected, peerCount, displayName, savedName, onNameChange, onNameEdit, onNameSave, onLeave }: {
  roomId: string
  isConnected: boolean
  peerCount: number
  displayName: string
  savedName: string
  onNameChange: (name: string) => void
  onNameEdit: () => void
  onNameSave: () => void
  onLeave: () => void
}) {
  return (
    <div className="shrink-0 border-b border-white/10 bg-graphite/50 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="hidden sm:block text-sm sm:text-lg font-display font-semibold text-paper truncate">
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
        <div className="flex items-center gap-3">
          {savedName ? (
            <button
              onClick={onNameEdit}
              title="Change name"
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-paper transition-all hover:bg-white/10"
            >
              <span className="font-medium truncate max-w-[8rem]">{savedName}</span>
              <svg className="w-3 h-3 text-fog/60 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={displayName}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onNameSave() }}
                placeholder="Your name"
                maxLength={24}
                className="w-24 sm:w-32 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-paper placeholder:text-fog/40 outline-none focus:border-electric focus:ring-1 focus:ring-electric/20 transition-all"
              />
              <button
                onClick={onNameSave}
                title="Set name"
                className="shrink-0 px-3 py-1.5 bg-electric/10 border border-electric/30 text-electric text-sm font-medium rounded-lg transition-all hover:bg-electric/20 active:scale-[0.95]"
              >
                Save
              </button>
            </div>
          )}
          <button
            onClick={onLeave}
            className="shrink-0 px-4 py-2 bg-signal text-white font-medium rounded-lg transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] text-sm whitespace-nowrap"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}

import { useRef, useEffect, useState } from 'react'

interface PeerVideoProps {
  peerId: string
  stream: MediaStream
  isSpotlight: boolean
  isThumb: boolean
  onSelect: () => void
}

export default function PeerVideo({ peerId, stream, isSpotlight, isThumb, onSelect }: PeerVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isMuted, setIsMuted] = useState(false)
  const gainRef = useRef<GainNode | null>(null)

  // Attach stream and set up Web Audio API for per-peer mute
  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return

    video.srcObject = stream

    // Web Audio API gain node for reliable muting
    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const gain = audioCtx.createGain()
    source.connect(gain)
    gain.connect(audioCtx.destination)
    gainRef.current = gain

    // Mute video element natively so audio only comes through gain node
    video.muted = true
    video.volume = 0

    return () => {
      audioCtx.close()
      gainRef.current = null
    }
  }, [stream])

  // Update gain when mute state changes
  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = isMuted ? 0 : 1
    }
  }, [isMuted])

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsMuted(prev => !prev)
  }

  return (
    <div
      className={`video-cell ${isSpotlight ? 'spotlight-main' : ''}`}
      onClick={onSelect}
    >
      <div className={`video-inner ${isSpotlight ? 'spotlight-border' : ''}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="pointer-events-none"
        />

        <div className={`peer-label ${isThumb ? 'thumb-label' : ''}`}>
          Peer {peerId.slice(0, 8)}
        </div>

        <button
          className={`mute-btn ${isMuted ? 'muted' : ''} ${isThumb ? 'thumb-mute' : ''}`}
          title={isMuted ? 'Unmute peer' : 'Mute peer'}
          onClick={toggleMute}
        >
          {isMuted ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

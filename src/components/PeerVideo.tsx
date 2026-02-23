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

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return

    video.srcObject = stream

    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const gain = audioCtx.createGain()
    source.connect(gain)
    gain.connect(audioCtx.destination)
    gainRef.current = gain

    video.muted = true
    video.volume = 0

    return () => {
      audioCtx.close()
      gainRef.current = null
    }
  }, [stream])

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = isMuted ? 0 : 1
    }
  }, [isMuted])

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsMuted(prev => !prev)
  }

  // const cellClasses = [
  //   'flex items-center justify-center min-h-0 overflow-hidden cursor-pointer',
  //   isSpotlight ? 'flex-1' : '',
  //   isThumb ? 'flex-none w-[120px] md:w-[180px] h-full' : '',
  // ].join(' ')

  // const innerClasses = [
  //   'relative flex h-full max-w-full rounded-xl overflow-hidden border bg-[#1a1d24]',
  //   isSpotlight ? 'border-2 border-electric' : 'border-white/10',
  // ].join(' ')

  return (
    <div className={`min-w-0 w-full overflow-hidden cursor-pointer border border-green-500 ${isSpotlight ? '' : ''} ${isThumb ? 'flex-none w-[120px] md:w-[180px] h-full' : ''}`} onClick={onSelect}>
      <div className={`relative rounded-xl border bg-[#1a1d24] ${isSpotlight ? 'border-2 border-electric' : 'border-white/10'}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="block rounded-xl pointer-events-none object-contain"
        />

        <div className={`absolute pointer-events-none bg-graphite/80 backdrop-blur-sm border border-white/10 font-medium text-paper ${
          isThumb
            ? 'top-1 left-1 px-1 py-0.5 rounded text-[0.5rem]'
            : 'top-2 left-2 px-2 py-1 rounded-md text-[0.7rem]'
        }`}>
          Peer {peerId.slice(0, 8)}
        </div>

        <button
          className={`absolute flex items-center justify-center rounded-full backdrop-blur-sm border cursor-pointer transition-all z-[5] ${
            isThumb
              ? 'top-1 right-1 w-[22px] h-[22px]'
              : 'top-2 right-2 w-8 h-8'
          } ${
            isMuted
              ? 'bg-signal border-signal text-white'
              : 'bg-graphite/80 border-white/10 text-paper hover:bg-white/10'
          }`}
          title={isMuted ? 'Unmute peer' : 'Mute peer'}
          onClick={toggleMute}
        >
          {isMuted ? (
            <svg className={isThumb ? 'w-3 h-3' : 'w-4 h-4'} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
            </svg>
          ) : (
            <svg className={isThumb ? 'w-3 h-3' : 'w-4 h-4'} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

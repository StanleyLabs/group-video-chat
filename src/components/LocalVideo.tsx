import { forwardRef, useEffect, useRef, type RefObject } from 'react'

interface LocalVideoProps {
  videoRef: RefObject<HTMLVideoElement | null>
  isVideoMuted: boolean
}

const LocalVideo = forwardRef<HTMLDivElement, LocalVideoProps>(
  ({ videoRef, isVideoMuted }, pipRef) => {
    const internalVideoRef = useRef<HTMLVideoElement | null>(null)

    // Sync internal ref to parent's ref
    useEffect(() => {
      const el = internalVideoRef.current
      if (el) {
        el.muted = true
        el.volume = 0
      }
      // Write to parent ref via Object.assign to satisfy readonly constraint
      Object.assign(videoRef, { current: el })
      return () => {
        Object.assign(videoRef, { current: null })
      }
    }, [videoRef])

    return (
      <div
        ref={pipRef}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 w-40 sm:w-56 z-10 group"
        style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
      >
        <div className="relative aspect-video rounded-xl overflow-hidden border-2 border-electric shadow-lg shadow-electric/10">
          <video
            ref={internalVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover bg-graphite pointer-events-none"
          />
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-electric/90 backdrop-blur-sm rounded text-[10px] font-semibold text-white pointer-events-none">
            You
          </div>
          {isVideoMuted && (
            <div className="absolute inset-0 flex items-center justify-center bg-graphite/90 pointer-events-none">
              <div className="text-center">
                <svg className="w-6 h-6 text-fog/60 mx-auto mb-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  <path strokeLinecap="round" d="M3 21 21 3" />
                </svg>
                <div className="text-[10px] text-fog/60">Camera off</div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
)

LocalVideo.displayName = 'LocalVideo'
export default LocalVideo

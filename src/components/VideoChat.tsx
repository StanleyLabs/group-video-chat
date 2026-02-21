import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface VideoChatProps {
  roomId: string
  onLeave: () => void
}

interface PeerConnection extends RTCPeerConnection {
  peerId?: string
}

// Config
const USE_AUDIO = true
const USE_VIDEO = true
const MUTE_AUDIO_BY_DEFAULT = false
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

export default function VideoChat({ roomId, onLeave }: VideoChatProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [isAudioMuted, setIsAudioMuted] = useState(MUTE_AUDIO_BY_DEFAULT)
  const [isVideoMuted, setIsVideoMuted] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  
  const socketRef = useRef<Socket | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Record<string, PeerConnection>>({})
  const videoGridRef = useRef<HTMLDivElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const initConnection = async () => {
      const socket = io()
      socketRef.current = socket

      socket.on('connect', async () => {
        setIsConnected(true)
        await setupLocalMedia()
        socket.emit('join', { channel: roomId, userdata: { name: '' } })
      })

      socket.on('disconnect', () => {
        setIsConnected(false)
        cleanup()
      })

      socket.on('addPeer', async (config: { peer_id: string; should_create_offer: boolean }) => {
        await handleAddPeer(config)
      })

      socket.on('sessionDescription', (config: {
        peer_id: string
        session_description: RTCSessionDescriptionInit
      }) => {
        handleSessionDescription(config)
      })

      socket.on('iceCandidate', (config: {
        peer_id: string
        ice_candidate: RTCIceCandidateInit
      }) => {
        handleIceCandidate(config)
      })

      socket.on('removePeer', (config: { peer_id: string }) => {
        handleRemovePeer(config)
      })
    }

    initConnection()

    return () => {
      cleanup()
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [roomId])

  const setupLocalMedia = async () => {
    if (localStreamRef.current) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: USE_AUDIO,
        video: USE_VIDEO,
      })

      localStreamRef.current = stream

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.muted = true
      }

      if (MUTE_AUDIO_BY_DEFAULT) {
        stream.getAudioTracks().forEach(track => track.enabled = false)
      }
    } catch (error) {
      console.error('Access denied for audio/video:', error)
      alert('You chose not to provide access to the camera/microphone, demo will not work.')
    }
  }

  const handleAddPeer = async (config: { peer_id: string; should_create_offer: boolean }) => {
    const peerId = config.peer_id

    if (peersRef.current[peerId]) return

    const peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    }) as PeerConnection
    
    peerConnection.peerId = peerId
    peersRef.current[peerId] = peerConnection
    setPeerCount(Object.keys(peersRef.current).length)

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('relayICECandidate', {
          peer_id: peerId,
          ice_candidate: {
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            candidate: event.candidate.candidate,
          },
        })
      }
    }

    peerConnection.ontrack = (event) => {
      if (event.track.kind === 'audio' && USE_VIDEO) return

      const container = document.createElement('div')
      container.className = 'relative aspect-video'
      container.dataset.peerId = peerId

      const videoElement = document.createElement('video')
      videoElement.setAttribute('autoplay', 'true')
      videoElement.setAttribute('playsinline', 'true')
      if (MUTE_AUDIO_BY_DEFAULT) {
        videoElement.setAttribute('muted', 'true')
      }
      videoElement.className = 'w-full h-full object-cover rounded-xl border border-white/10 bg-graphite'
      videoElement.srcObject = event.streams[0]

      const label = document.createElement('div')
      label.className = 'absolute top-3 left-3 px-3 py-1.5 bg-graphite/80 backdrop-blur-sm border border-white/10 rounded-lg text-xs font-medium text-paper'
      label.textContent = `Peer ${peerId.slice(0, 8)}`

      container.appendChild(videoElement)
      container.appendChild(label)

      if (videoGridRef.current) {
        videoGridRef.current.appendChild(container)
      }
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          peerConnection.addTrack(track, localStreamRef.current)
        }
      })
    }

    if (config.should_create_offer) {
      try {
        const localDescription = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(localDescription)
        
        if (socketRef.current) {
          socketRef.current.emit('relaySessionDescription', {
            peer_id: peerId,
            session_description: localDescription,
          })
        }
      } catch (error) {
        console.error('Error sending offer:', error)
      }
    }
  }

  const handleSessionDescription = async (config: {
    peer_id: string
    session_description: RTCSessionDescriptionInit
  }) => {
    const peerId = config.peer_id
    const peer = peersRef.current[peerId]
    if (!peer) return

    const remoteDescription = config.session_description

    try {
      await peer.setRemoteDescription(new RTCSessionDescription(remoteDescription))

      if (remoteDescription.type === 'offer') {
        const localDescription = await peer.createAnswer()
        await peer.setLocalDescription(localDescription)

        if (socketRef.current) {
          socketRef.current.emit('relaySessionDescription', {
            peer_id: peerId,
            session_description: localDescription,
          })
        }
      }
    } catch (error) {
      console.error('setRemoteDescription error:', error)
    }
  }

  const handleIceCandidate = (config: {
    peer_id: string
    ice_candidate: RTCIceCandidateInit
  }) => {
    const peer = peersRef.current[config.peer_id]
    if (peer) {
      peer.addIceCandidate(new RTCIceCandidate(config.ice_candidate))
    }
  }

  const handleRemovePeer = (config: { peer_id: string }) => {
    const peerId = config.peer_id

    if (videoGridRef.current) {
      const container = videoGridRef.current.querySelector(
        `div[data-peer-id="${peerId}"]`
      )
      if (container) {
        const videoElement = container.querySelector('video') as HTMLVideoElement
        if (videoElement) videoElement.srcObject = null
        container.remove()
      }
    }

    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close()
      delete peersRef.current[peerId]
      setPeerCount(Object.keys(peersRef.current).length)
    }
  }

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }

    Object.values(peersRef.current).forEach((peer) => peer.close())
    peersRef.current = {}
    setPeerCount(0)

    if (videoGridRef.current) {
      videoGridRef.current.innerHTML = ''
    }
  }

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks()
      audioTracks.forEach(track => { track.enabled = !track.enabled })
      setIsAudioMuted(!audioTracks[0]?.enabled)
    }
  }

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks()
      videoTracks.forEach(track => { track.enabled = !track.enabled })
      setIsVideoMuted(!videoTracks[0]?.enabled)
    }
  }

  const handleLeave = () => {
    cleanup()
    if (socketRef.current) {
      socketRef.current.disconnect()
    }
    onLeave()
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 border-b border-white/10 bg-graphite/50 backdrop-blur-sm px-4 sm:px-6 py-3">
        <div className="mx-auto max-w-7xl flex items-center justify-between gap-3">
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
            onClick={handleLeave}
            className="shrink-0 px-4 py-2 bg-signal text-white font-medium rounded-lg transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] text-sm whitespace-nowrap"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Video grid — fills available space */}
      <div className="flex-1 min-h-0 p-4 overflow-auto">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Local video */}
            <div className="relative aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover rounded-xl border-2 border-electric bg-graphite"
              />
              <div className="absolute top-3 left-3 px-3 py-1.5 bg-electric/90 backdrop-blur-sm border border-electric rounded-lg text-xs font-semibold text-white">
                You
              </div>
              {isVideoMuted && (
                <div className="absolute inset-0 flex items-center justify-center bg-graphite/90 rounded-xl border-2 border-electric">
                  <div className="text-center">
                    <svg className="w-10 h-10 text-fog/60 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /><path strokeLinecap="round" d="M3 21 21 3" /></svg>
                    <div className="text-sm text-fog/60">Camera off</div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Remote videos */}
            <div ref={videoGridRef} className="contents" />
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="shrink-0 border-t border-white/10 bg-graphite/50 backdrop-blur-sm px-6 py-4">
        <div className="mx-auto max-w-7xl flex justify-center items-center gap-3">
          <button
            onClick={toggleAudio}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isAudioMuted
                ? 'bg-signal text-white hover:brightness-110'
                : 'bg-white/5 border border-white/15 text-paper hover:bg-white/10'
            } active:scale-[0.95]`}
            title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isAudioMuted ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /><path strokeLinecap="round" d="M3 21 21 3" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
            )}
          </button>
          
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isVideoMuted
                ? 'bg-signal text-white hover:brightness-110'
                : 'bg-white/5 border border-white/15 text-paper hover:bg-white/10'
            } active:scale-[0.95]`}
            title={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
          >
            {isVideoMuted ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /><path strokeLinecap="round" d="M3 21 21 3" /></svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
            )}
          </button>
          
          <button
            onClick={handleLeave}
            className="w-12 h-12 rounded-full bg-signal text-white flex items-center justify-center transition-all hover:brightness-110 active:scale-[0.95]"
            title="Leave room"
          >
            <svg className="w-5 h-5 rotate-[135deg]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

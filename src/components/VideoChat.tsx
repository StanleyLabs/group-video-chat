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
      console.log('Connecting to signaling server')
      const socket = io()
      socketRef.current = socket

      socket.on('connect', async () => {
        console.log('Connected to signaling server')
        setIsConnected(true)
        
        // Setup local media
        await setupLocalMedia()
        
        // Join the room
        socket.emit('join', {
          channel: roomId,
          userdata: { name: '' },
        })
      })

      socket.on('disconnect', () => {
        console.log('Disconnected from signaling server')
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
      console.log('Requesting access to local audio / video inputs')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: USE_AUDIO,
        video: USE_VIDEO,
      })

      console.log('Access granted to audio/video')
      localStreamRef.current = stream

      // Display local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.muted = true
      }

      // Apply initial mute state
      if (MUTE_AUDIO_BY_DEFAULT) {
        stream.getAudioTracks().forEach(track => track.enabled = false)
      }
    } catch (error) {
      console.error('Access denied for audio/video:', error)
      alert('You chose not to provide access to the camera/microphone, demo will not work.')
    }
  }

  const handleAddPeer = async (config: { peer_id: string; should_create_offer: boolean }) => {
    console.log('Signaling server said to add peer:', config)
    const peerId = config.peer_id

    if (peersRef.current[peerId]) {
      console.log(`Already connected to peer ${peerId}`)
      return
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    }) as PeerConnection
    
    peerConnection.peerId = peerId
    peersRef.current[peerId] = peerConnection
    setPeerCount(Object.keys(peersRef.current).length)

    // Handle ICE candidates
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

    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      console.log('onTrack', event)
      if (event.track.kind === 'audio' && USE_VIDEO) return

      // Create container for remote video with label
      const container = document.createElement('div')
      container.className = 'relative group'
      container.dataset.peerId = peerId

      // Create video element for remote peer
      const videoElement = document.createElement('video')
      videoElement.setAttribute('autoplay', 'true')
      videoElement.setAttribute('playsinline', 'true')
      if (MUTE_AUDIO_BY_DEFAULT) {
        videoElement.setAttribute('muted', 'true')
      }
      videoElement.className = 'w-full aspect-video object-cover rounded-xl border border-white/10 bg-graphite'
      videoElement.srcObject = event.streams[0]

      // Create label overlay
      const label = document.createElement('div')
      label.className = 'absolute top-3 left-3 px-3 py-1.5 bg-graphite/80 backdrop-blur-sm border border-white/10 rounded-lg text-xs font-medium text-paper'
      label.textContent = `Peer ${peerId.slice(0, 8)}`

      container.appendChild(videoElement)
      container.appendChild(label)

      if (videoGridRef.current) {
        videoGridRef.current.appendChild(container)
      }
    }

    // Add local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        if (localStreamRef.current) {
          peerConnection.addTrack(track, localStreamRef.current)
        }
      })
    }

    // Create offer if needed
    if (config.should_create_offer) {
      console.log(`Creating RTC offer to ${peerId}`)
      try {
        const localDescription = await peerConnection.createOffer()
        console.log('Local offer description is:', localDescription)
        await peerConnection.setLocalDescription(localDescription)
        
        if (socketRef.current) {
          socketRef.current.emit('relaySessionDescription', {
            peer_id: peerId,
            session_description: localDescription,
          })
        }
        console.log('Offer setLocalDescription succeeded')
      } catch (error) {
        console.error('Error sending offer:', error)
      }
    }
  }

  const handleSessionDescription = async (config: {
    peer_id: string
    session_description: RTCSessionDescriptionInit
  }) => {
    console.log('Remote description received:', config)
    const peerId = config.peer_id
    const peer = peersRef.current[peerId]
    if (!peer) return

    const remoteDescription = config.session_description

    try {
      await peer.setRemoteDescription(new RTCSessionDescription(remoteDescription))
      console.log('setRemoteDescription succeeded')

      if (remoteDescription.type === 'offer') {
        console.log('Creating answer')
        const localDescription = await peer.createAnswer()
        console.log('Answer description is:', localDescription)
        await peer.setLocalDescription(localDescription)

        if (socketRef.current) {
          socketRef.current.emit('relaySessionDescription', {
            peer_id: peerId,
            session_description: localDescription,
          })
        }
        console.log('Answer setLocalDescription succeeded')
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
    console.log('Signaling server said to remove peer:', config)
    const peerId = config.peer_id

    // Remove video container
    if (videoGridRef.current) {
      const container = videoGridRef.current.querySelector(
        `div[data-peer-id="${peerId}"]`
      )
      if (container) {
        const videoElement = container.querySelector('video') as HTMLVideoElement
        if (videoElement) {
          videoElement.srcObject = null
        }
        container.remove()
      }
    }

    // Close peer connection
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close()
      delete peersRef.current[peerId]
      setPeerCount(Object.keys(peersRef.current).length)
    }
  }

  const cleanup = () => {
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }

    // Close all peer connections
    Object.values(peersRef.current).forEach((peer) => {
      peer.close()
    })
    peersRef.current = {}
    setPeerCount(0)

    // Clear video elements
    if (videoGridRef.current) {
      videoGridRef.current.innerHTML = ''
    }
  }

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks()
      audioTracks.forEach(track => {
        track.enabled = !track.enabled
      })
      setIsAudioMuted(!audioTracks[0]?.enabled)
    }
  }

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks()
      videoTracks.forEach(track => {
        track.enabled = !track.enabled
      })
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
    <div className="min-h-[calc(100vh-64px)] bg-ink text-white flex flex-col">
      {/* Top bar */}
      <div className="border-b border-white/10 bg-graphite/50 backdrop-blur-sm px-6 py-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-display font-semibold text-paper">
              Room: <span className="text-electric font-mono">{roomId}</span>
            </h2>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-xs font-mono text-fog">
                {isConnected ? 'Connected' : 'Connecting...'}
              </span>
            </div>
            {peerCount > 0 && (
              <div className="text-xs font-mono text-fog">
                {peerCount} {peerCount === 1 ? 'peer' : 'peers'}
              </div>
            )}
          </div>
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-signal text-white font-medium rounded-lg transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] text-sm"
          >
            Leave Room
          </button>
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="container mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
            {/* Local video */}
            <div className="relative group">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full aspect-video object-cover rounded-xl border-2 border-electric bg-graphite shadow-glow-electric"
              />
              <div className="absolute top-3 left-3 px-3 py-1.5 bg-electric/90 backdrop-blur-sm border border-electric rounded-lg text-xs font-semibold text-white">
                You
              </div>
              {isVideoMuted && (
                <div className="absolute inset-0 flex items-center justify-center bg-graphite/90 rounded-xl">
                  <div className="text-center">
                    <div className="text-4xl mb-2">📹</div>
                    <div className="text-sm text-fog">Camera off</div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Remote videos container */}
            <div ref={videoGridRef} className="contents" />
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="border-t border-white/10 bg-graphite/50 backdrop-blur-sm px-6 py-6">
        <div className="container mx-auto flex justify-center items-center gap-4">
          <button
            onClick={toggleAudio}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all ${
              isAudioMuted
                ? 'bg-signal border-signal text-white hover:brightness-110'
                : 'bg-white/5 border border-white/15 text-paper hover:bg-white/10'
            } active:scale-[0.95]`}
            title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isAudioMuted ? '🔇' : '🎤'}
          </button>
          
          <button
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all ${
              isVideoMuted
                ? 'bg-signal border-signal text-white hover:brightness-110'
                : 'bg-white/5 border border-white/15 text-paper hover:bg-white/10'
            } active:scale-[0.95]`}
            title={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
          >
            {isVideoMuted ? '📷' : '🎥'}
          </button>
          
          <button
            onClick={handleLeave}
            className="w-14 h-14 rounded-full bg-signal text-white flex items-center justify-center text-2xl transition-all hover:brightness-110 active:scale-[0.95]"
            title="Leave room"
          >
            📞
          </button>
        </div>
      </div>
    </div>
  )
}

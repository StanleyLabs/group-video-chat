import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface VideoChatProps {
  roomId: string
}

interface PeerConnection extends RTCPeerConnection {
  peerId?: string
}

// Config
const USE_AUDIO = true
const USE_VIDEO = true
const MUTE_AUDIO_BY_DEFAULT = false
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

export default function VideoChat({ roomId }: VideoChatProps) {
  const [isConnected, setIsConnected] = useState(false)
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

      // Create video element for remote peer
      const videoElement = document.createElement('video')
      videoElement.setAttribute('autoplay', 'true')
      videoElement.setAttribute('playsinline', 'true')
      if (MUTE_AUDIO_BY_DEFAULT) {
        videoElement.setAttribute('muted', 'true')
      }
      videoElement.setAttribute('controls', '')
      videoElement.className = 'w-80 h-60 border border-gray-700'
      videoElement.dataset.peerId = peerId
      videoElement.srcObject = event.streams[0]

      if (videoGridRef.current) {
        videoGridRef.current.appendChild(videoElement)
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

    // Remove video element
    if (videoGridRef.current) {
      const videoElement = videoGridRef.current.querySelector(
        `video[data-peer-id="${peerId}"]`
      ) as HTMLVideoElement
      if (videoElement) {
        videoElement.srcObject = null
        videoElement.remove()
      }
    }

    // Close peer connection
    if (peersRef.current[peerId]) {
      peersRef.current[peerId].close()
      delete peersRef.current[peerId]
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

    // Clear video elements
    if (videoGridRef.current) {
      videoGridRef.current.innerHTML = ''
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl text-center mb-8">
        Room ID: <span className="text-purple-500">{roomId}</span>
      </h1>
      
      {!isConnected && (
        <div className="text-center text-gray-400">
          <p>Connecting to room...</p>
        </div>
      )}

      <div className="flex flex-wrap gap-4 justify-center">
        {/* Local video */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          controls
          className="w-80 h-60 border border-purple-500"
        />
        
        {/* Remote videos container */}
        <div ref={videoGridRef} className="flex flex-wrap gap-4 justify-center" />
      </div>
    </div>
  )
}

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import DeviceSelect from './DeviceSelect'

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
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('')
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('')
  
  const socketRef = useRef<Socket | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peersRef = useRef<Record<string, PeerConnection>>({})
  const videoGridRef = useRef<HTMLDivElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audio = devices.filter(d => d.kind === 'audioinput')
      const video = devices.filter(d => d.kind === 'videoinput')
      setAudioDevices(audio)
      setVideoDevices(video)

      // Set current device IDs from active stream
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0]
        const videoTrack = localStreamRef.current.getVideoTracks()[0]
        if (audioTrack) {
          const settings = audioTrack.getSettings()
          if (settings.deviceId) setSelectedAudioDevice(settings.deviceId)
        }
        if (videoTrack) {
          const settings = videoTrack.getSettings()
          if (settings.deviceId) setSelectedVideoDevice(settings.deviceId)
        }
      }
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
    }
  }, [])

  const replaceTrack = useCallback(async (kind: 'audio' | 'video', deviceId: string) => {
    if (!localStreamRef.current) return

    try {
      const constraints: MediaStreamConstraints = kind === 'audio'
        ? { audio: { deviceId: { exact: deviceId } } }
        : { video: { deviceId: { exact: deviceId } } }

      const newStream = await navigator.mediaDevices.getUserMedia(constraints)
      const newTrack = kind === 'audio' ? newStream.getAudioTracks()[0] : newStream.getVideoTracks()[0]

      if (!newTrack) return

      // Replace track in local stream
      const oldTrack = kind === 'audio'
        ? localStreamRef.current.getAudioTracks()[0]
        : localStreamRef.current.getVideoTracks()[0]

      if (oldTrack) {
        localStreamRef.current.removeTrack(oldTrack)
        oldTrack.stop()
      }
      localStreamRef.current.addTrack(newTrack)

      // Preserve mute state
      if (kind === 'audio') {
        newTrack.enabled = !isAudioMuted
      } else {
        newTrack.enabled = !isVideoMuted
        // Update local video preview
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current
        }
      }

      // Replace track on all peer connections
      for (const peer of Object.values(peersRef.current)) {
        const senders = peer.getSenders()
        const sender = senders.find(s => s.track?.kind === kind)
        if (sender) {
          await sender.replaceTrack(newTrack)
        }
      }

      if (kind === 'audio') {
        setSelectedAudioDevice(deviceId)
      } else {
        setSelectedVideoDevice(deviceId)
      }
    } catch (err) {
      console.error(`Failed to switch ${kind} device:`, err)
    }
  }, [isAudioMuted, isVideoMuted])

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
        localVideoRef.current.volume = 0
      }

      if (MUTE_AUDIO_BY_DEFAULT) {
        stream.getAudioTracks().forEach(track => track.enabled = false)
      }

      // Enumerate devices after getting permission
      await enumerateDevices()
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

      // Mute peer button
      const muteBtn = document.createElement('button')
      muteBtn.className = 'absolute top-3 right-3 w-8 h-8 rounded-full bg-graphite/80 backdrop-blur-sm border border-white/10 flex items-center justify-center text-paper hover:bg-white/10 transition-all'
      muteBtn.title = 'Mute peer'
      muteBtn.innerHTML = `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>`
      let peerMuted = false
      const originalStream = event.streams[0]
      muteBtn.addEventListener('click', () => {
        peerMuted = !peerMuted
        if (peerMuted) {
          // Create a video-only stream to kill audio
          const silentStream = new MediaStream(originalStream.getVideoTracks())
          videoElement.srcObject = silentStream
        } else {
          // Restore original stream with audio
          videoElement.srcObject = originalStream
        }
        if (peerMuted) {
          muteBtn.className = 'absolute top-3 right-3 w-8 h-8 rounded-full bg-signal backdrop-blur-sm border border-signal flex items-center justify-center text-white hover:brightness-110 transition-all'
          muteBtn.innerHTML = `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>`
          muteBtn.title = 'Unmute peer'
        } else {
          muteBtn.className = 'absolute top-3 right-3 w-8 h-8 rounded-full bg-graphite/80 backdrop-blur-sm border border-white/10 flex items-center justify-center text-paper hover:bg-white/10 transition-all'
          muteBtn.innerHTML = `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>`
          muteBtn.title = 'Mute peer'
        }
      })

      container.appendChild(videoElement)
      container.appendChild(label)
      container.appendChild(muteBtn)

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

  const confirmLeave = () => {
    setShowLeaveConfirm(true)
  }

  const handleLeave = () => {
    cleanup()
    if (socketRef.current) {
      socketRef.current.disconnect()
    }
    onLeave()
  }

  // Grid classes based on peer count for maximum space usage
  const gridClasses = peerCount === 1
    ? 'flex items-center justify-center'
    : peerCount <= 4
      ? 'grid grid-cols-1 sm:grid-cols-2 gap-4'
      : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
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
            onClick={confirmLeave}
            className="shrink-0 px-4 py-2 bg-signal text-white font-medium rounded-lg transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] text-sm whitespace-nowrap"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Main video area — remote peers centered */}
      <div className="flex-1 min-h-0 p-4 overflow-auto">
        <div className="mx-auto max-w-7xl h-full">
          {peerCount === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="text-fog/60 text-sm font-mono mb-2">Waiting for others to join...</div>
              <div className="text-fog/40 text-xs font-mono">Share room ID: <span className="text-electric">{roomId}</span></div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className={`${peerCount === 1 ? 'w-full max-w-3xl' : 'w-full max-w-5xl'} ${gridClasses}`}>
                <div ref={videoGridRef} className="contents" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Local video — picture-in-picture bottom center */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-40 sm:w-56 z-10 group">
        <div className="relative aspect-video rounded-xl overflow-hidden border-2 border-electric shadow-lg shadow-electric/10">
          <video
            ref={(el) => {
              localVideoRef.current = el
              if (el) { el.muted = true; el.volume = 0 }
            }}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover bg-graphite"
          />
          <div className="absolute top-2 left-2 px-2 py-0.5 bg-electric/90 backdrop-blur-sm rounded text-[10px] font-semibold text-white">
            You
          </div>
          {isVideoMuted && (
            <div className="absolute inset-0 flex items-center justify-center bg-graphite/90">
              <div className="text-center">
                <svg className="w-6 h-6 text-fog/60 mx-auto mb-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /><path strokeLinecap="round" d="M3 21 21 3" /></svg>
                <div className="text-[10px] text-fog/60">Camera off</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings panel — slides up from controls bar */}
      {showSettings && (
        <div className="absolute bottom-[88px] left-1/2 -translate-x-1/2 z-20 w-80 sm:w-96 bg-graphite border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-display font-semibold text-paper">Device Settings</h3>
            <button
              onClick={() => setShowSettings(false)}
              className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-fog hover:bg-white/10 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="space-y-4">
            <DeviceSelect
              label="Microphone"
              icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>}
              devices={audioDevices}
              selectedDeviceId={selectedAudioDevice}
              onSelect={(id) => replaceTrack('audio', id)}
              fallbackLabel="Microphone"
            />

            <DeviceSelect
              label="Camera"
              icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>}
              devices={videoDevices}
              selectedDeviceId={selectedVideoDevice}
              onSelect={(id) => replaceTrack('video', id)}
              fallbackLabel="Camera"
            />
          </div>
        </div>
      )}

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

          {/* Settings button */}
          <button
            onClick={() => { setShowSettings(!showSettings); enumerateDevices() }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              showSettings
                ? 'bg-electric text-white hover:brightness-110'
                : 'bg-white/5 border border-white/15 text-paper hover:bg-white/10'
            } active:scale-[0.95]`}
            title="Device settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
          </button>
          
          <button
            onClick={confirmLeave}
            className="w-12 h-12 rounded-full bg-signal text-white flex items-center justify-center transition-all hover:brightness-110 active:scale-[0.95]"
            title="Leave room"
          >
            <svg className="w-5 h-5 rotate-[135deg]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>
          </button>
        </div>
      </div>

      {/* Leave confirmation modal */}
      {showLeaveConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm">
          <div className="bg-graphite border border-white/10 rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-signal/10 border border-signal/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-signal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
            </div>
            <h3 className="text-lg font-display font-semibold text-paper mb-2">Leave room?</h3>
            <p className="text-sm text-fog mb-6">You'll be disconnected from all peers in this room.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-white/15 bg-white/5 text-paper font-medium rounded-lg transition-all hover:bg-white/10 active:scale-[0.98] text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleLeave}
                className="flex-1 px-4 py-2.5 bg-signal text-white font-medium rounded-lg transition-all hover:brightness-110 active:scale-[0.98] text-sm"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

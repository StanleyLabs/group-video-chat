import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

interface UseWebRTCOptions {
  roomId: string
  localStream: MediaStream | null
  onConnected: () => void
  onDisconnected: () => void
  onPeerAdded: (peerId: string, stream: MediaStream) => void
  onPeerRemoved: (peerId: string) => void
  onPeerName: (peerId: string, name: string) => void
}

export function useWebRTC({
  roomId,
  localStream,
  onConnected,
  onDisconnected,
  onPeerAdded,
  onPeerRemoved,
  onPeerName,
}: UseWebRTCOptions) {
  const socketRef = useRef<Socket | null>(null)
  const peersRef = useRef<Record<string, RTCPeerConnection>>({})

  const getSocket = useCallback(() => socketRef.current, [])

  // Replace tracks in all peer connections (for device switching)
  const replaceTrackInPeers = useCallback(async (kind: 'audio' | 'video', newTrack: MediaStreamTrack) => {
    for (const pc of Object.values(peersRef.current)) {
      const sender = pc.getSenders().find(s => s.track?.kind === kind)
      if (sender) await sender.replaceTrack(newTrack)
    }
  }, [])

  useEffect(() => {
    if (!localStream) return

    const socket = io()
    socketRef.current = socket

    socket.on('connect', () => {
      onConnected()
      socket.emit('join', { channel: roomId, userdata: { name: '' } })
    })

    socket.on('disconnect', () => {
      onDisconnected()
    })

    socket.on('addPeer', async (config: { peer_id: string; should_create_offer: boolean }) => {
      const peerId = config.peer_id
      if (peersRef.current[peerId]) return

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      peersRef.current[peerId] = pc

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('relayICECandidate', {
            peer_id: peerId,
            ice_candidate: {
              sdpMLineIndex: e.candidate.sdpMLineIndex,
              candidate: e.candidate.candidate,
            },
          })
        }
      }

      pc.ontrack = (e) => {
        if (e.track.kind === 'audio') return
        onPeerAdded(peerId, e.streams[0])
      }

      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream)
      })

      if (config.should_create_offer) {
        try {
          const desc = await pc.createOffer()
          await pc.setLocalDescription(desc)
          socket.emit('relaySessionDescription', {
            peer_id: peerId,
            session_description: desc,
          })
        } catch (err) {
          console.error('Error creating offer:', err)
        }
      }
    })

    socket.on('sessionDescription', async (config: {
      peer_id: string
      session_description: RTCSessionDescriptionInit
    }) => {
      const peer = peersRef.current[config.peer_id]
      if (!peer) return

      try {
        await peer.setRemoteDescription(new RTCSessionDescription(config.session_description))
        if (config.session_description.type === 'offer') {
          const desc = await peer.createAnswer()
          await peer.setLocalDescription(desc)
          socket.emit('relaySessionDescription', {
            peer_id: config.peer_id,
            session_description: desc,
          })
        }
      } catch (err) {
        console.error('setRemoteDescription error:', err)
      }
    })

    socket.on('iceCandidate', (config: { peer_id: string; ice_candidate: RTCIceCandidateInit }) => {
      const peer = peersRef.current[config.peer_id]
      if (peer) peer.addIceCandidate(new RTCIceCandidate(config.ice_candidate))
    })

    socket.on('removePeer', (config: { peer_id: string }) => {
      const peerId = config.peer_id
      if (peersRef.current[peerId]) {
        peersRef.current[peerId].close()
        delete peersRef.current[peerId]
      }
      onPeerRemoved(peerId)
    })

    socket.on('peerName', (config: { peer_id: string; name: string }) => {
      onPeerName(config.peer_id, config.name)
    })

    return () => {
      Object.values(peersRef.current).forEach(pc => pc.close())
      peersRef.current = {}
      socket.disconnect()
      socketRef.current = null
    }
  }, [roomId, localStream, onConnected, onDisconnected, onPeerAdded, onPeerRemoved, onPeerName])

  const sendName = useCallback((name: string) => {
    socketRef.current?.emit('relayName', { name })
  }, [])

  return { getSocket, replaceTrackInPeers, sendName }
}

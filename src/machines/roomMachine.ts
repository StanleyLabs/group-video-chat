import { setup, assign } from 'xstate'

/* ---- Types ---- */

export interface PeerData {
  id: string
  stream: MediaStream
}

export interface RoomContext {
  roomId: string
  localStream: MediaStream | null
  peerList: PeerData[]
  spotlightPeerId: string | null
  isAudioMuted: boolean
  isVideoMuted: boolean
  error: string | null
}

export type RoomEvent =
  | { type: 'MEDIA_READY'; stream: MediaStream }
  | { type: 'MEDIA_ERROR'; error: string }
  | { type: 'SOCKET_CONNECTED' }
  | { type: 'SOCKET_DISCONNECTED' }
  | { type: 'PEER_ADDED'; peerId: string; stream: MediaStream }
  | { type: 'PEER_REMOVED'; peerId: string }
  | { type: 'SPOTLIGHT'; peerId: string | null }
  | { type: 'TOGGLE_AUDIO' }
  | { type: 'TOGGLE_VIDEO' }
  | { type: 'LEAVE' }

/* ---- Machine ---- */

export const roomMachine = setup({
  types: {
    context: {} as RoomContext,
    events: {} as RoomEvent,
    input: {} as { roomId: string },
  },
  actions: {
    setLocalStream: assign({
      localStream: ({ event }) => (event as Extract<RoomEvent, { type: 'MEDIA_READY' }>).stream,
    }),
    setError: assign({
      error: ({ event }) => (event as Extract<RoomEvent, { type: 'MEDIA_ERROR' }>).error,
    }),
    addPeer: assign({
      peerList: ({ context, event }) => {
        const e = event as Extract<RoomEvent, { type: 'PEER_ADDED' }>
        if (context.peerList.some(p => p.id === e.peerId)) return context.peerList
        return [...context.peerList, { id: e.peerId, stream: e.stream }]
      },
    }),
    removePeer: assign({
      peerList: ({ context, event }) => {
        const e = event as Extract<RoomEvent, { type: 'PEER_REMOVED' }>
        return context.peerList.filter(p => p.id !== e.peerId)
      },
      spotlightPeerId: ({ context, event }) => {
        const e = event as Extract<RoomEvent, { type: 'PEER_REMOVED' }>
        return context.spotlightPeerId === e.peerId ? null : context.spotlightPeerId
      },
    }),
    setSpotlight: assign({
      spotlightPeerId: ({ event }) =>
        (event as Extract<RoomEvent, { type: 'SPOTLIGHT' }>).peerId,
    }),
    toggleAudio: assign({
      isAudioMuted: ({ context }) => {
        const muted = !context.isAudioMuted
        context.localStream?.getAudioTracks().forEach(t => { t.enabled = !muted })
        return muted
      },
    }),
    toggleVideo: assign({
      isVideoMuted: ({ context }) => {
        const muted = !context.isVideoMuted
        context.localStream?.getVideoTracks().forEach(t => { t.enabled = !muted })
        return muted
      },
    }),
    cleanup: assign({
      localStream: ({ context }) => {
        context.localStream?.getTracks().forEach(t => t.stop())
        return null
      },
      peerList: () => [],
      spotlightPeerId: () => null,
      error: () => null,
    }),
  },
}).createMachine({
  id: 'room',
  initial: 'requestingMedia',
  context: ({ input }) => ({
    roomId: input.roomId,
    localStream: null,
    peerList: [],
    spotlightPeerId: null,
    isAudioMuted: false,
    isVideoMuted: false,
    error: null,
  }),
  on: {
    LEAVE: {
      target: '.left',
      actions: 'cleanup',
    },
  },
  states: {
    requestingMedia: {
      on: {
        MEDIA_READY: {
          target: 'connecting',
          actions: 'setLocalStream',
        },
        MEDIA_ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },

    connecting: {
      on: {
        SOCKET_CONNECTED: 'connected',
        SOCKET_DISCONNECTED: {
          target: 'disconnected',
          actions: 'cleanup',
        },
      },
    },

    connected: {
      on: {
        PEER_ADDED: { actions: 'addPeer' },
        PEER_REMOVED: { actions: 'removePeer' },
        SPOTLIGHT: { actions: 'setSpotlight' },
        TOGGLE_AUDIO: { actions: 'toggleAudio' },
        TOGGLE_VIDEO: { actions: 'toggleVideo' },
        SOCKET_DISCONNECTED: {
          target: 'disconnected',
          actions: 'cleanup',
        },
      },
    },

    disconnected: {
      type: 'final',
    },

    error: {
      type: 'final',
    },

    left: {
      type: 'final',
    },
  },
})

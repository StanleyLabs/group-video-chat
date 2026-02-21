import { Server } from 'socket.io'

export default function initSignaling(server) {
    const io = new Server(server)
    const channels = {}
    const sockets = {}

    io.on('connection', (socket) => {
        socket.channels = {}
        sockets[socket.id] = socket

        console.log(`[${socket.id}] connection accepted`)

        socket.on('disconnect', () => {
            for (const channel in socket.channels) {
                part(channel)
            }
            console.log(`[${socket.id}] disconnected`)
            delete sockets[socket.id]
        })

        socket.on('join', (config) => {
            console.log(`[${socket.id}] join`, config)
            const { channel } = config

            if (channel in socket.channels) {
                console.log(`[${socket.id}] ERROR: already joined ${channel}`)
                return
            }

            if (!(channel in channels)) {
                channels[channel] = {}
            }

            for (const id in channels[channel]) {
                channels[channel][id].emit('addPeer', {
                    peer_id: socket.id,
                    should_create_offer: false,
                })
                socket.emit('addPeer', {
                    peer_id: id,
                    should_create_offer: true,
                })
            }

            channels[channel][socket.id] = socket
            socket.channels[channel] = channel
        })

        socket.on('part', part)

        socket.on('relayICECandidate', (config) => {
            const { peer_id, ice_candidate } = config
            if (peer_id in sockets) {
                sockets[peer_id].emit('iceCandidate', {
                    peer_id: socket.id,
                    ice_candidate,
                })
            }
        })

        socket.on('relaySessionDescription', (config) => {
            const { peer_id, session_description } = config
            if (peer_id in sockets) {
                sockets[peer_id].emit('sessionDescription', {
                    peer_id: socket.id,
                    session_description,
                })
            }
        })

        function part(channel) {
            console.log(`[${socket.id}] part`)

            if (!(channel in socket.channels)) {
                console.log(`[${socket.id}] ERROR: not in ${channel}`)
                return
            }

            delete socket.channels[channel]
            delete channels[channel][socket.id]

            for (const id in channels[channel]) {
                channels[channel][id].emit('removePeer', { peer_id: socket.id })
                socket.emit('removePeer', { peer_id: id })
            }
        }
    })
}

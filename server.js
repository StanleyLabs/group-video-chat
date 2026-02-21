import { createServer as createHttpServer } from 'http'
import { createServer as createHttpsServer } from 'https'
import { readFileSync } from 'fs'
import routes from './routes.js'
import initSignaling from './signaling-server.js'

const PORT = process.env.PORT || 3000
const useHTTPS = false

let server
if (useHTTPS) {
    const options = {
        key: readFileSync('certs/key.pem', 'utf-8'),
        cert: readFileSync('certs/cert.pem', 'utf-8'),
    }
    server = createHttpsServer(options, routes)
} else {
    server = createHttpServer(routes)
}

server.listen(PORT, () => {
    console.log(`${useHTTPS ? 'HTTPS' : 'HTTP'} Server listening on port ${PORT}`)
})

initSignaling(server)

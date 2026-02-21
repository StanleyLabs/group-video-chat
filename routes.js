import express from 'express'
import { resolve } from 'path'

const routes = express()

routes.use(express.static('dist'))
routes.use(express.static('public'))
routes.use(express.json())
routes.use(express.urlencoded({ extended: true }))

routes.get('/test', (req, res) => {
    res.send('😊')
})

// SPA fallback
routes.get('*', (req, res) => {
    res.sendFile(resolve('dist', 'index.html'))
})

export default routes

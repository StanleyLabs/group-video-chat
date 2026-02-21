const express = require('express')
const path = require('path')

const routes = express()

// Serve static files from dist (production build) or public (for assets like favicon)
routes.use(express.static('dist'))
routes.use(express.static('public'))
routes.use(express.json())
routes.use(express.urlencoded({ extended: true }))

routes.get('/test', (req, res) => {
    res.send('😊')
})

// Serve index.html for all other routes (SPA fallback)
routes.get('*', (req, res) => {
    res.sendFile(path.resolve('dist', 'index.html'))
})

module.exports = routes

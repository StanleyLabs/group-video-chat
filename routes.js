const express = require('express')

const routes = express()

routes.use(express.static('public'))
routes.use(express.json())
routes.use(express.urlencoded({ extended: true }))

routes.get('/test', (req, res) => {
    res.send('😊')
})

module.exports = routes

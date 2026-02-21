# Group Video Chat

### Group video chat application built on Node.js, WebRTC, and Socket.IO

---

## Architecture

- **server.js** — Starts the HTTP/HTTPS server, serves static files via Express, and initializes the signaling server.
- **routes.js** — Handles HTTP routes.
- **signaling-server.js** — Socket.IO signaling server for WebRTC peer connection setup.
- **public/** — Client-side code (HTML, JS). All video/audio elements are created dynamically.

---

## Running

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Notes

- Over plain HTTP, WebRTC media only works on `localhost`. For cross-device use, serve over HTTPS (set `useHTTPS = true` in `server.js` and provide certs in `certs/`).
- The signaling server is required to coordinate WebRTC peer connections. Once peers connect, all audio/video streams are peer-to-peer (no media goes through the server).

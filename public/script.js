/** CONFIG **/
let USE_AUDIO = true
let USE_VIDEO = true
const DEFAULT_CHANNEL = 'some-global-channel-name'
const MUTE_AUDIO_BY_DEFAULT = false

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

let signaling_socket = null
let local_media_stream = null
let peers = {}
let peer_media_elements = {} // peer_id -> { cell: div, video: video }

/* ── Device Selection ── */

let deviceChangeTimer = null

async function enumerateDevices(showToast) {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const cameraSelect = document.getElementById('camera-select')
  const micSelect = document.getElementById('mic-select')

  const currentCamera = cameraSelect.value
  const currentMic = micSelect.value

  cameraSelect.innerHTML = ''
  micSelect.innerHTML = ''

  let cameraIndex = 0
  let micIndex = 0

  devices.forEach(device => {
    const option = document.createElement('option')
    option.value = device.deviceId
    if (device.kind === 'videoinput') {
      option.text = device.label || `Camera ${++cameraIndex}`
      cameraSelect.appendChild(option)
    } else if (device.kind === 'audioinput') {
      option.text = device.label || `Microphone ${++micIndex}`
      micSelect.appendChild(option)
    }
  })

  // Restore previous selection if still available
  if (currentCamera && cameraSelect.querySelector(`option[value="${currentCamera}"]`)) {
    cameraSelect.value = currentCamera
  }
  if (currentMic && micSelect.querySelector(`option[value="${currentMic}"]`)) {
    micSelect.value = currentMic
  }

  if (showToast) {
    // Flash dropdown borders
    cameraSelect.classList.add('device-updated')
    micSelect.classList.add('device-updated')
    setTimeout(() => {
      cameraSelect.classList.remove('device-updated')
      micSelect.classList.remove('device-updated')
    }, 2000)

    // Show toast notification
    const toast = document.getElementById('device-toast')
    // Reset animation by cloning
    const newToast = toast.cloneNode(true)
    newToast.style.display = 'block'
    toast.parentNode.replaceChild(newToast, toast)
  }
}

async function switchDevice() {
  const cameraId = document.getElementById('camera-select').value
  const micId = document.getElementById('mic-select').value

  const constraints = {
    video: cameraId ? { deviceId: { exact: cameraId } } : USE_VIDEO,
    audio: micId ? { deviceId: { exact: micId } } : USE_AUDIO,
  }

  try {
    const newStream = await navigator.mediaDevices.getUserMedia(constraints)

    if (local_media_stream) {
      local_media_stream.getTracks().forEach(t => t.stop())
    }
    local_media_stream = newStream

    const localVideo = document.querySelector('#local-video-container video')
    if (localVideo) localVideo.srcObject = newStream

    // Replace tracks in all peer connections
    for (const peer_id in peers) {
      const senders = peers[peer_id].getSenders()
      for (const sender of senders) {
        if (sender.track && sender.track.kind === 'video') {
          const vt = newStream.getVideoTracks()[0]
          if (vt) sender.replaceTrack(vt)
        } else if (sender.track && sender.track.kind === 'audio') {
          const at = newStream.getAudioTracks()[0]
          if (at) sender.replaceTrack(at)
        }
      }
    }
  } catch (err) {
    console.error('Error switching device:', err)
  }
}

/* ── Grid Column Management ── */

function updateGridColumns() {
  const grid = document.getElementById('video-grid')
  const peerCount = Object.keys(peer_media_elements).length
  if (peerCount > 3) {
    grid.classList.add('two-col')
  } else {
    grid.classList.remove('two-col')
  }
}

/* ── Draggable Local Video ── */

function setupDraggable() {
  const el = document.getElementById('local-video-container')
  let dragging = false
  let offsetX = 0
  let offsetY = 0

  // Position bottom-right (use explicit px, no bottom/right CSS)
  el.style.left = (window.innerWidth - el.offsetWidth - 16) + 'px'
  el.style.top = (window.innerHeight - el.offsetHeight - 16) + 'px'

  function clampPosition() {
    let x = parseFloat(el.style.left) || 0
    let y = parseFloat(el.style.top) || 0
    x = Math.max(0, Math.min(x, window.innerWidth - el.offsetWidth))
    y = Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight))
    el.style.left = x + 'px'
    el.style.top = y + 'px'
  }

  // --- Mouse events (desktop/trackpad) ---
  el.addEventListener('mousedown', e => {
    e.preventDefault()
    dragging = true
    offsetX = e.clientX - el.getBoundingClientRect().left
    offsetY = e.clientY - el.getBoundingClientRect().top
    el.classList.add('dragging')
  })

  document.addEventListener('mousemove', e => {
    if (!dragging) return
    e.preventDefault()
    let x = e.clientX - offsetX
    let y = e.clientY - offsetY
    x = Math.max(0, Math.min(x, window.innerWidth - el.offsetWidth))
    y = Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight))
    el.style.left = x + 'px'
    el.style.top = y + 'px'
  })

  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false
      el.classList.remove('dragging')
    }
  })

  // --- Touch events (mobile) ---
  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return
    e.preventDefault()
    dragging = true
    const touch = e.touches[0]
    offsetX = touch.clientX - el.getBoundingClientRect().left
    offsetY = touch.clientY - el.getBoundingClientRect().top
    el.classList.add('dragging')
  }, { passive: false })

  document.addEventListener('touchmove', e => {
    if (!dragging) return
    e.preventDefault()
    const touch = e.touches[0]
    let x = touch.clientX - offsetX
    let y = touch.clientY - offsetY
    x = Math.max(0, Math.min(x, window.innerWidth - el.offsetWidth))
    y = Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight))
    el.style.left = x + 'px'
    el.style.top = y + 'px'
  }, { passive: false })

  document.addEventListener('touchend', () => {
    if (dragging) {
      dragging = false
      el.classList.remove('dragging')
    }
  })

  window.addEventListener('resize', clampPosition)
}

/* ── Tap to Expand (Remote Videos) ── */

function setupTapToExpand(cellEl) {
  cellEl.addEventListener('click', () => {
    const grid = document.getElementById('video-grid')
    const wasExpanded = cellEl.classList.contains('expanded')

    // Collapse all
    grid.querySelectorAll('.video-cell.expanded').forEach(c => c.classList.remove('expanded'))

    if (!wasExpanded) {
      cellEl.classList.add('expanded')
      cellEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

/* ── Top Bar Spacer ── */

function updateTopBarSpacer() {
  const topBar = document.getElementById('top-bar')
  const grid = document.getElementById('video-grid')
  if (topBar && grid) {
    grid.style.paddingTop = topBar.offsetHeight + 'px'
  }
}

/* ── Main Init ── */

function init() {
  console.log('Connecting to signaling server')
  signaling_socket = io()

  let room = getRoomID()
  removeStartScreen()
  showRoomUI(room)

  signaling_socket.on('connect', () => {
    console.log('Connected to signaling server')
    setup_local_media(() => {
      join_chat_channel(room, { name: '' })
    })
  })

  signaling_socket.on('disconnect', () => {
    console.log('Disconnected from signaling server')
    for (let peer_id in peer_media_elements) {
      peer_media_elements[peer_id].cell.remove()
    }
    for (let peer_id in peers) {
      peers[peer_id].close()
    }
    peers = {}
    peer_media_elements = {}
    updateGridColumns()
  })

  function join_chat_channel(channel, userdata) {
    signaling_socket.emit('join', { channel: channel, userdata: userdata })
  }

  signaling_socket.on('addPeer', async config => {
    console.log('Signaling server said to add peer:', config)
    let peer_id = config.peer_id
    if (peer_id in peers) {
      console.log(`Already connected to peer ${peer_id}`)
      return
    }

    let peer_connection = new RTCPeerConnection(
      { iceServers: ICE_SERVERS },
      { optional: [{ DtlsSrtpKeyAgreement: true }] }
    )
    peers[peer_id] = peer_connection

    peer_connection.onicecandidate = event => {
      if (event.candidate) {
        signaling_socket.emit('relayICECandidate', {
          peer_id: peer_id,
          ice_candidate: {
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            candidate: event.candidate.candidate,
          },
        })
      }
    }

    peer_connection.ontrack = event => {
      console.log('onTrack', event)
      if (event.track.kind === 'audio' && USE_VIDEO) return

      // Wrap video in a cell div for click handling
      const cell = document.createElement('div')
      cell.className = 'video-cell'

      const remote_media = USE_VIDEO
        ? document.createElement('video')
        : document.createElement('audio')
      remote_media.setAttribute('autoplay', 'true')
      remote_media.setAttribute('playsinline', 'true')
      if (MUTE_AUDIO_BY_DEFAULT) {
        remote_media.setAttribute('muted', 'true')
      }

      cell.appendChild(remote_media)
      document.getElementById('video-grid').appendChild(cell)
      remote_media.srcObject = event.streams[0]

      peer_media_elements[peer_id] = { cell, video: remote_media }

      setupTapToExpand(cell)
      updateGridColumns()
    }

    local_media_stream.getTracks().forEach(track => {
      peer_connection.addTrack(track, local_media_stream)
    })

    if (config.should_create_offer) {
      console.log(`Creating RTC offer to ${peer_id}`)
      try {
        const desc = await peer_connection.createOffer()
        await peer_connection.setLocalDescription(desc)
        signaling_socket.emit('relaySessionDescription', {
          peer_id: peer_id,
          session_description: desc,
        })
      } catch (error) {
        console.log('Error sending offer:', error)
      }
    }
  })

  signaling_socket.on('sessionDescription', async config => {
    let peer_id = config.peer_id
    let peer = peers[peer_id]
    let remote_description = config.session_description

    try {
      await peer.setRemoteDescription(new RTCSessionDescription(remote_description))
      if (remote_description.type === 'offer') {
        const desc = await peer.createAnswer()
        await peer.setLocalDescription(desc)
        signaling_socket.emit('relaySessionDescription', {
          peer_id: peer_id,
          session_description: desc,
        })
      }
    } catch (error) {
      console.log('setRemoteDescription error:', error)
    }
  })

  signaling_socket.on('iceCandidate', config => {
    let peer = peers[config.peer_id]
    peer.addIceCandidate(new RTCIceCandidate(config.ice_candidate))
  })

  signaling_socket.on('removePeer', config => {
    let peer_id = config.peer_id
    if (peer_id in peer_media_elements) {
      peer_media_elements[peer_id].cell.remove()
    }
    if (peer_id in peers) {
      peers[peer_id].close()
    }
    delete peers[peer_id]
    delete peer_media_elements[peer_id]
    updateGridColumns()
  })
}

/* ── Local Media Setup ── */

function setup_local_media(callback, errorback) {
  if (local_media_stream != null) {
    if (callback) callback()
    return
  }

  console.log('Requesting access to local audio / video inputs')

  navigator.mediaDevices
    .getUserMedia({ audio: USE_AUDIO, video: USE_VIDEO })
    .then(async stream => {
      console.log('Access granted to audio/video')
      local_media_stream = stream

      const localContainer = document.getElementById('local-video-container')
      const localVideo = localContainer.querySelector('video')
      localVideo.srcObject = stream
      localContainer.style.display = 'block'

      // Populate device dropdowns (no toast on first load)
      await enumerateDevices(false)

      // Listen for device changes with toast
      navigator.mediaDevices.addEventListener('devicechange', () => {
        console.log('Device change detected')
        enumerateDevices(true)
      })

      document.getElementById('camera-select').addEventListener('change', switchDevice)
      document.getElementById('mic-select').addEventListener('change', switchDevice)

      // Setup draggable after a frame so layout is settled
      requestAnimationFrame(() => {
        setupDraggable()
      })

      // Top bar spacer
      requestAnimationFrame(updateTopBarSpacer)

      if (callback) callback()
    })
    .catch(() => {
      console.log('Access denied for audio/video')
      alert('You chose not to provide access to the camera/microphone, demo will not work.')
      if (errorback) errorback()
    })
}

/* ── UI Helpers ── */

function getRoomID() {
  return document.getElementById('room').value
}

function removeStartScreen() {
  document.getElementById('start-screen').style.display = 'none'
}

function showRoomUI(roomId) {
  const topBar = document.getElementById('top-bar')
  const header = document.getElementById('room-header')
  header.textContent = `Room: ${roomId}`
  topBar.style.display = 'flex'

  document.getElementById('video-grid').style.display = 'grid'

  window.addEventListener('resize', updateTopBarSpacer)

  // Use ResizeObserver on top-bar to keep spacer in sync
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updateTopBarSpacer).observe(topBar)
  }
}

document.getElementById('join').addEventListener('click', init)
document.getElementById('room').focus()
document.getElementById('room').select()

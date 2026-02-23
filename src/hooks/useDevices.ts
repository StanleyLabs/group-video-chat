import { useState, useEffect, useCallback } from 'react'

interface UseDevicesOptions {
  localStream: MediaStream | null
  onTrackReplaced?: (kind: 'audio' | 'video', track: MediaStreamTrack) => void
}

export function useDevices({ localStream, onTrackReplaced }: UseDevicesOptions) {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('')
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('')
  const [showToast, setShowToast] = useState(false)

  const enumerate = useCallback(async (toast = false) => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setAudioDevices(devices.filter(d => d.kind === 'audioinput'))
      setVideoDevices(devices.filter(d => d.kind === 'videoinput'))

      if (localStream) {
        const at = localStream.getAudioTracks()[0]
        const vt = localStream.getVideoTracks()[0]
        if (at?.getSettings().deviceId) setSelectedAudioDevice(at.getSettings().deviceId!)
        if (vt?.getSettings().deviceId) setSelectedVideoDevice(vt.getSettings().deviceId!)
      }

      if (toast) {
        setShowToast(true)
        setTimeout(() => setShowToast(false), 2500)
      }
    } catch (err) {
      console.error('Failed to enumerate devices:', err)
    }
  }, [localStream])

  // Initial enumeration when stream is available
  useEffect(() => {
    if (localStream) enumerate()
  }, [localStream, enumerate])

  // Listen for device changes
  useEffect(() => {
    const handler = () => enumerate(true)
    navigator.mediaDevices.addEventListener('devicechange', handler)
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler)
  }, [enumerate])

  const switchDevice = useCallback(async (kind: 'audio' | 'video', deviceId: string) => {
    if (!localStream) return

    try {
      const constraints: MediaStreamConstraints = kind === 'audio'
        ? { audio: { deviceId: { exact: deviceId } } }
        : { video: { deviceId: { exact: deviceId } } }

      const newStream = await navigator.mediaDevices.getUserMedia(constraints)
      const newTrack = kind === 'audio'
        ? newStream.getAudioTracks()[0]
        : newStream.getVideoTracks()[0]

      if (!newTrack) return

      // Replace in local stream
      const oldTrack = kind === 'audio'
        ? localStream.getAudioTracks()[0]
        : localStream.getVideoTracks()[0]

      if (oldTrack) {
        // Preserve enabled state
        newTrack.enabled = oldTrack.enabled
        localStream.removeTrack(oldTrack)
        oldTrack.stop()
      }
      localStream.addTrack(newTrack)

      if (kind === 'audio') setSelectedAudioDevice(deviceId)
      else setSelectedVideoDevice(deviceId)

      onTrackReplaced?.(kind, newTrack)
    } catch (err) {
      console.error(`Failed to switch ${kind} device:`, err)
    }
  }, [localStream, onTrackReplaced])

  return {
    audioDevices,
    videoDevices,
    selectedAudioDevice,
    selectedVideoDevice,
    showToast,
    enumerate,
    switchDevice,
  }
}

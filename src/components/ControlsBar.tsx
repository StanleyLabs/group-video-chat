import { useState } from 'react'
import DeviceSelect from './DeviceSelect'

interface DevicesAPI {
  audioDevices: MediaDeviceInfo[]
  videoDevices: MediaDeviceInfo[]
  selectedAudioDevice: string
  selectedVideoDevice: string
  enumerate: () => void
  switchDevice: (kind: 'audio' | 'video', deviceId: string) => void
}

interface ControlsBarProps {
  isAudioMuted: boolean
  isVideoMuted: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onLeave: () => void
  devices: DevicesAPI
}

export default function ControlsBar({
  isAudioMuted,
  isVideoMuted,
  onToggleAudio,
  onToggleVideo,
  onLeave,
  devices,
}: ControlsBarProps) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      {/* Settings panel */}
      {showSettings && (
        <div className="absolute bottom-[88px] left-1/2 -translate-x-1/2 z-20 w-80 sm:w-96 bg-graphite border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-display font-semibold text-paper">Device Settings</h3>
            <button
              onClick={() => setShowSettings(false)}
              className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-fog hover:bg-white/10 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-4">
            <DeviceSelect
              label="Microphone"
              icon={<MicIcon />}
              devices={devices.audioDevices}
              selectedDeviceId={devices.selectedAudioDevice}
              onSelect={(id) => devices.switchDevice('audio', id)}
              fallbackLabel="Microphone"
            />
            <DeviceSelect
              label="Camera"
              icon={<CameraIcon />}
              devices={devices.videoDevices}
              selectedDeviceId={devices.selectedVideoDevice}
              onSelect={(id) => devices.switchDevice('video', id)}
              fallbackLabel="Camera"
            />
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div className="shrink-0 border-t border-white/10 bg-graphite/50 backdrop-blur-sm px-6 py-4 landscape-compact">
        <div className="mx-auto max-w-7xl flex justify-center items-center gap-3">
          <ControlButton
            active={isAudioMuted}
            onClick={onToggleAudio}
            title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            <MicIcon muted={isAudioMuted} />
          </ControlButton>

          <ControlButton
            active={isVideoMuted}
            onClick={onToggleVideo}
            title={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
          >
            <CameraIcon muted={isVideoMuted} />
          </ControlButton>

          <ControlButton
            active={showSettings}
            onClick={() => { setShowSettings(!showSettings); devices.enumerate() }}
            title="Device settings"
            activeColor="electric"
          >
            <SettingsIcon />
          </ControlButton>

          <button
            onClick={onLeave}
            className="w-12 h-12 rounded-full bg-signal text-white flex items-center justify-center transition-all hover:brightness-110 active:scale-[0.95]"
            title="Leave room"
          >
            <PhoneIcon />
          </button>
        </div>
      </div>
    </>
  )
}

/* ---- Helpers ---- */

function ControlButton({ active, onClick, title, activeColor = 'signal', children }: {
  active: boolean
  onClick: () => void
  title: string
  activeColor?: 'signal' | 'electric'
  children: React.ReactNode
}) {
  const activeClasses = activeColor === 'signal'
    ? 'bg-signal text-white hover:brightness-110'
    : 'bg-electric text-white hover:brightness-110'

  return (
    <button
      onClick={onClick}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-[0.95] ${
        active ? activeClasses : 'bg-white/5 border border-white/15 text-paper hover:bg-white/10'
      }`}
      title={title}
    >
      {children}
    </button>
  )
}

/* ---- Icons ---- */

function MicIcon({ muted }: { muted?: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
      {muted && <path strokeLinecap="round" d="M3 21 21 3" />}
    </svg>
  )
}

function CameraIcon({ muted }: { muted?: boolean }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
      {muted && <path strokeLinecap="round" d="M3 21 21 3" />}
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg className="w-5 h-5 rotate-[135deg]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
    </svg>
  )
}

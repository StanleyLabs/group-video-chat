import { useState, useRef, useEffect } from 'react'

interface DeviceSelectProps {
  label: string
  icon: React.ReactNode
  devices: MediaDeviceInfo[]
  selectedDeviceId: string
  onSelect: (deviceId: string) => void
  fallbackLabel: string
}

export default function DeviceSelect({ label, icon, devices, selectedDeviceId, onSelect, fallbackLabel }: DeviceSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedDevice = devices.find(d => d.deviceId === selectedDeviceId)
  const selectedLabel = selectedDevice?.label || (devices.length > 0 ? `${fallbackLabel} 1` : `No ${fallbackLabel.toLowerCase()} found`)

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClick)
      return () => document.removeEventListener('mousedown', handleClick)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <label className="flex items-center gap-2 text-xs font-medium text-fog mb-1.5">
        {icon}
        {label}
      </label>

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white/5 border rounded-lg text-sm text-paper outline-none transition-all cursor-pointer hover:bg-white/[0.07] ${
          isOpen ? 'border-electric ring-2 ring-electric/20' : 'border-white/10'
        }`}
      >
        <span className="truncate">{selectedLabel}</span>
        <svg className={`w-4 h-4 shrink-0 text-fog transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && devices.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-graphite border border-white/10 rounded-lg shadow-2xl overflow-hidden z-50">
          <div className="max-h-48 overflow-y-auto py-1 subtle-scroll">
            {devices.map((device, i) => {
              const deviceLabel = device.label || `${fallbackLabel} ${i + 1}`
              const isSelected = device.deviceId === selectedDeviceId
              return (
                <button
                  key={device.deviceId}
                  type="button"
                  onClick={() => {
                    onSelect(device.deviceId)
                    setIsOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm transition-all flex items-center gap-2 ${
                    isSelected
                      ? 'bg-electric/10 text-electric'
                      : 'text-paper hover:bg-white/5'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                  <span className={`truncate ${isSelected ? '' : 'ml-5.5'}`} style={isSelected ? undefined : { marginLeft: '22px' }}>
                    {deviceLabel}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

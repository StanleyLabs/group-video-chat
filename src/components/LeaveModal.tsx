interface LeaveModalProps {
  onConfirm: () => void
  onCancel: () => void
}

export default function LeaveModal({ onConfirm, onCancel }: LeaveModalProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm">
      <div className="bg-graphite border border-white/10 rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
        <div className="w-14 h-14 rounded-full bg-signal/10 border border-signal/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-signal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
        </div>
        <h3 className="text-lg font-display font-semibold text-paper mb-2">Leave room?</h3>
        <p className="text-sm text-fog mb-6">You'll be disconnected from all peers in this room.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-white/15 bg-white/5 text-paper font-medium rounded-lg transition-all hover:bg-white/10 active:scale-[0.98] text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-signal text-white font-medium rounded-lg transition-all hover:brightness-110 active:scale-[0.98] text-sm"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}

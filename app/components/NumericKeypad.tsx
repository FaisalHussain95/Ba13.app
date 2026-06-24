'use client'

interface NumericKeypadProps {
  value: string
  onChange: (value: string) => void
  maxChars?: number           // default 6
  maxDecimalPlaces?: number   // default 2
  onSubmit?: () => void       // called when the OK cell is pressed
}

export default function NumericKeypad({
  value,
  onChange,
  maxChars = 6,
  maxDecimalPlaces = 2,
  onSubmit,
}: NumericKeypadProps) {
  function handleDigit(digit: string) {
    onChange((() => {
      if (value.length >= maxChars) return value
      // Prevent leading zeros (e.g. "007")
      if (value === '0' && digit !== '.') return digit
      // Enforce max decimal places
      const dotIdx = value.indexOf('.')
      if (dotIdx !== -1 && value.length - dotIdx - 1 >= maxDecimalPlaces) return value
      return value + digit
    })())
  }

  function handleDecimal() {
    onChange((() => {
      if (value.includes('.')) return value
      if (value.length >= maxChars - 1) return value
      if (value === '') return '0.'
      return value + '.'
    })())
  }

  function handleBackspace() {
    onChange(value.slice(0, -1))
  }

  function handleClear() {
    onChange('')
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {/* Row 1: 7 8 9 ⌫ */}
      {(['7', '8', '9'] as const).map((d) => (
        <KeyButton key={d} label={d} onClick={() => handleDigit(d)} />
      ))}
      <KeyButton label="⌫" onClick={handleBackspace} variant="action" />

      {/* Row 2: 4 5 6 C */}
      {(['4', '5', '6'] as const).map((d) => (
        <KeyButton key={d} label={d} onClick={() => handleDigit(d)} />
      ))}
      <KeyButton label="C" onClick={handleClear} variant="action" />

      {/* Row 3: 1 2 3 . */}
      {(['1', '2', '3'] as const).map((d) => (
        <KeyButton key={d} label={d} onClick={() => handleDigit(d)} />
      ))}
      <KeyButton label="." onClick={handleDecimal} variant="action" />

      {/* Row 4: 0 (spans 2), empty, OK (if onSubmit provided) */}
      <button
        onClick={() => handleDigit('0')}
        className="col-span-2 min-h-[56px] rounded-xl bg-[#f0f0ee] text-xl font-semibold text-[#1f2937] active:bg-[#e0e0dc]"
      >
        0
      </button>
      {/* Empty cell */}
      <div />
      {onSubmit ? (
        <button
          onClick={onSubmit}
          className="min-h-[56px] rounded-xl bg-[#1d4ed8] text-sm font-bold text-white active:bg-[#1e40af]"
        >
          OK
        </button>
      ) : (
        <div />
      )}
    </div>
  )
}

interface KeyButtonProps {
  label: string
  onClick: () => void
  variant?: 'digit' | 'action'
}

function KeyButton({ label, onClick, variant = 'digit' }: KeyButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[56px] rounded-xl text-xl font-semibold active:opacity-70 ${
        variant === 'action'
          ? 'bg-[#e5e7eb] text-[#374151]'
          : 'bg-[#f0f0ee] text-[#1f2937]'
      }`}
    >
      {label}
    </button>
  )
}

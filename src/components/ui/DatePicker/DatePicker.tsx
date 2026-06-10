import { useState, useRef, useEffect, useCallback } from "react"
import styles from "./DatePicker.module.css"

// ─── Portuguese locale ────────────────────────────────────────────
const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
]
const DAY_LABELS = ["D","S","T","Q","Q","S","S"]

// ─── Helpers ──────────────────────────────────────────────────────
function isoToDisplay(iso: string): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("-")
  if (!y || !m || !d) return ""
  return `${d}/${m}/${y}`
}

function displayToIso(display: string): string {
  const digits = display.replace(/\D/g, "")
  if (digits.length < 8) return ""
  const d = digits.slice(0, 2)
  const m = digits.slice(2, 4)
  const y = digits.slice(4, 8)
  if (+m < 1 || +m > 12 || +d < 1 || +d > 31) return ""
  return `${y}-${m}-${d}`
}

function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8)
  let out = digits
  if (digits.length > 4) out = `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
  else if (digits.length > 2) out = `${digits.slice(0,2)}/${digits.slice(2)}`
  return out
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split("-").map(Number)
  return { y, m: m - 1, d }
}

function isAfterMax(iso: string, max?: string): boolean {
  if (!max || !iso) return false
  return iso > max
}

const YEAR_OPTIONS: number[] = (() => {
  const current = new Date().getFullYear()
  const years: number[] = []
  for (let y = current; y >= 1900; y--) years.push(y)
  return years
})()

// ─── Props ────────────────────────────────────────────────────────
interface DatePickerProps {
  label?:     string
  required?:  boolean
  value?:     string      // ISO YYYY-MM-DD
  onChange?:  (e: { target: { value: string } }) => void
  max?:       string      // ISO YYYY-MM-DD
  min?:       string
  error?:     string
  disabled?:  boolean
  className?: string
}

export function DatePicker({
  label, required, value = "", onChange, max, min,
  error, disabled, className = "",
}: DatePickerProps) {
  const today = new Date()

  const [displayVal, setDisplayVal] = useState(() => isoToDisplay(value))
  const [open, setOpen]             = useState(false)
  const [viewYear, setViewYear]     = useState(() => {
    const p = parseIso(value)
    return p ? p.y : today.getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => {
    const p = parseIso(value)
    return p ? p.m : today.getMonth()
  })
  const [yearDropOpen, setYearDropOpen] = useState(false)

  const rootRef    = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const yearListRef = useRef<HTMLDivElement>(null)

  // Sync display if value prop changes externally
  useEffect(() => {
    setDisplayVal(isoToDisplay(value))
    const p = parseIso(value)
    if (p) { setViewYear(p.y); setViewMonth(p.m) }
  }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setYearDropOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Scroll active year into view when dropdown opens
  useEffect(() => {
    if (!yearDropOpen || !yearListRef.current) return
    const active = yearListRef.current.querySelector("[data-active='true']") as HTMLElement
    if (active) active.scrollIntoView({ block: "center" })
  }, [yearDropOpen])

  const emit = useCallback((iso: string) => {
    onChange?.({ target: { value: iso } })
  }, [onChange])

  // ── Input typing handler ──
  function handleInputChange(raw: string) {
    const masked = maskDate(raw)
    setDisplayVal(masked)
    const iso = displayToIso(masked)
    if (iso && !isAfterMax(iso, max) && (!min || iso >= min)) emit(iso)
    else if (!iso) emit("")
  }

  function handleInputBlur() {
    const iso = displayToIso(displayVal)
    if (!iso) {
      setDisplayVal("")
      emit("")
    }
  }

  // ── Calendar navigation ──
  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  function selectDay(day: number) {
    const m = String(viewMonth + 1).padStart(2, "0")
    const d = String(day).padStart(2, "0")
    const iso = `${viewYear}-${m}-${d}`
    if (isAfterMax(iso, max) || (min && iso < min)) return
    emit(iso)
    setDisplayVal(isoToDisplay(iso))
    setOpen(false)
  }

  // ── Calendar grid ──
  const selected = parseIso(value)
  const totalDays = daysInMonth(viewYear, viewMonth)
  const firstDay  = firstDayOfMonth(viewYear, viewMonth)
  const todayIso  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`
  const maxIso    = max ?? ""
  const minIso    = min ?? ""

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]

  return (
    <div ref={rootRef} className={`${styles.root} ${className}`}>
      {label && (
        <label className={styles.label}>
          {label}{required && <span className={styles.required}>*</span>}
        </label>
      )}

      {/* Text input + calendar icon */}
      <div className={`${styles.inputWrap} ${error ? styles.inputWrapError : ""} ${disabled ? styles.inputWrapDisabled : ""}`}>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          placeholder="DD/MM/AAAA"
          value={displayVal}
          maxLength={10}
          disabled={disabled}
          className={styles.textInput}
          onChange={e => handleInputChange(e.target.value)}
          onBlur={handleInputBlur}
          onKeyDown={e => { if (e.key === "Escape") setOpen(false) }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          className={styles.calBtn}
          onClick={() => { if (!disabled) setOpen(o => !o) }}
          aria-label="Abrir calendário"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </button>
      </div>

      {error && <span className={styles.errorMsg}>{error}</span>}

      {/* Calendar popover */}
      {open && (
        <div className={styles.popover}>
          {/* Header */}
          <div className={styles.header}>
            <button type="button" className={styles.navBtn} onClick={prevMonth} aria-label="Mês anterior">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            <div className={styles.headerCenter}>
              {/* Month label */}
              <span className={styles.monthLabel}>{MONTHS[viewMonth]}</span>

              {/* Year dropdown trigger */}
              <div className={styles.yearDropWrap}>
                <button
                  type="button"
                  className={styles.yearBtn}
                  onClick={() => setYearDropOpen(o => !o)}
                >
                  {viewYear}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {yearDropOpen && (
                  <div ref={yearListRef} className={styles.yearList}>
                    {YEAR_OPTIONS.map(y => (
                      <button
                        key={y}
                        type="button"
                        data-active={y === viewYear}
                        className={`${styles.yearOption} ${y === viewYear ? styles.yearOptionActive : ""}`}
                        onClick={() => { setViewYear(y); setYearDropOpen(false) }}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button type="button" className={styles.navBtn} onClick={nextMonth} aria-label="Próximo mês">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          {/* Day-of-week labels */}
          <div className={styles.dayRow}>
            {DAY_LABELS.map((d, i) => (
              <span key={i} className={styles.dayLabel}>{d}</span>
            ))}
          </div>

          {/* Day grid */}
          <div className={styles.grid}>
            {cells.map((day, i) => {
              if (!day) return <span key={`e${i}`} />
              const m  = String(viewMonth + 1).padStart(2, "0")
              const dd = String(day).padStart(2, "0")
              const iso = `${viewYear}-${m}-${dd}`
              const isSelected  = selected && selected.y === viewYear && selected.m === viewMonth && selected.d === day
              const isToday     = iso === todayIso
              const isDisabled  = (maxIso && iso > maxIso) || (minIso && iso < minIso)
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!!isDisabled}
                  className={[
                    styles.day,
                    isSelected  ? styles.daySelected : "",
                    isToday && !isSelected ? styles.dayToday : "",
                    isDisabled  ? styles.dayDisabled : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => selectDay(day)}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Today shortcut */}
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.todayBtn}
              disabled={!!(maxIso && todayIso > maxIso) || !!(minIso && todayIso < minIso)}
              onClick={() => {
                emit(todayIso)
                setDisplayVal(isoToDisplay(todayIso))
                setViewYear(today.getFullYear())
                setViewMonth(today.getMonth())
                setOpen(false)
              }}
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

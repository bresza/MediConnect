import { useState } from "react"
import type { Appointment } from "../../types"
import { ChevronIcon } from "./AppointmentIcons"
import { DAYS_SHORT, MONTHS_SHORT, toDateStr } from "./calendarUtils"
import styles from "./Appointments.module.css"

interface MiniCalendarPickerProps {
  currentDate: Date
  appointments: Appointment[]
  onSelectDate: (date: Date) => void
  popupClass?: string
}

export function MiniCalendarPicker({
  currentDate,
  appointments,
  onSelectDate,
  popupClass,
}: MiniCalendarPickerProps) {
  const [pickerMonth, setPickerMonth] = useState(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
  )
  const [showYearGrid, setShowYearGrid] = useState(false)

  const year = pickerMonth.getFullYear()
  const month = pickerMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<number | null> = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

  const todayStr = toDateStr(new Date())
  const selectedStr = toDateStr(currentDate)
  const decadeStart = Math.floor(year / 10) * 10
  const yearRange = Array.from({ length: 12 }, (_, index) => decadeStart - 1 + index)
  const pickerClassName = [styles.picker, popupClass].filter(Boolean).join(" ")
  const dayDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`

  if (showYearGrid) {
    return (
      <div className={pickerClassName}>
        <div className={styles.pickerHeader}>
          <button
            className={styles.pickerArrow}
            onClick={() => setPickerMonth(new Date(year - 10, month, 1))}
          >
            <ChevronIcon dir="left" />
          </button>

          <div className={styles.yearRangeLabel}>
            <span className={styles.yearRangeText}>
              {decadeStart}-{decadeStart + 9}
            </span>
            <button className={styles.yearRangeBack} onClick={() => setShowYearGrid(false)}>
              <svg
                width="11"
                height="11"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              Fechar
            </button>
          </div>

          <button
            className={styles.pickerArrow}
            onClick={() => setPickerMonth(new Date(year + 10, month, 1))}
          >
            <ChevronIcon dir="right" />
          </button>
        </div>

        <div className={styles.yearGrid}>
          {yearRange.map((yearOption) => (
            <button
              key={yearOption}
              className={[
                styles.yearCell,
                yearOption === year ? styles.yearCellActive : "",
                yearOption < decadeStart || yearOption > decadeStart + 9
                  ? styles.yearCellOutside
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setPickerMonth(new Date(yearOption, month, 1))
                setShowYearGrid(false)
              }}
            >
              {yearOption}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={pickerClassName}>
      <div className={styles.pickerHeader}>
        <button
          className={styles.pickerArrow}
          onClick={() => setPickerMonth(new Date(year, month - 1, 1))}
        >
          <ChevronIcon dir="left" />
        </button>

        <button className={styles.pickerMonthYear} onClick={() => setShowYearGrid(true)}>
          {MONTHS_SHORT[month]}
          <span className={styles.pickerYearBadge}>{year}</span>
          <svg
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
            strokeLinecap="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <button
          className={styles.pickerArrow}
          onClick={() => setPickerMonth(new Date(year, month + 1, 1))}
        >
          <ChevronIcon dir="right" />
        </button>
      </div>

      <div className={styles.pickerGrid}>
        {DAYS_SHORT.map((day) => (
          <div key={day} className={styles.pickerDayLabel}>
            {day}
          </div>
        ))}

        {cells.map((day, index) => {
          if (day === null) return <div key={`blank-${index}`} />

          const dateStr = dayDateStr(day)
          const isSelected = dateStr === selectedStr
          const isToday = dateStr === todayStr
          const hasAppointment = appointments.some((appointment) => appointment.date === dateStr)

          return (
            <button
              key={day}
              className={[
                styles.pickerDayCell,
                isSelected ? styles.pickerDayCellSelected : "",
                isToday && !isSelected ? styles.pickerDayCellToday : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectDate(new Date(year, month, day))}
            >
              <span>{day}</span>
              {hasAppointment && <span className={styles.pickerDot} />}
            </button>
          )
        })}
      </div>

      <div className={styles.pickerFooter}>
        <button className={styles.pickerTodayBtn} onClick={() => onSelectDate(new Date())}>
          Ir para hoje
        </button>
      </div>
    </div>
  )
}

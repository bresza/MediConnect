import type { DaySlot } from "../../../services/appointments"
import styles from "./PatientDaySlotsGrid.module.css"

interface PatientDaySlotsGridProps {
  daySlots: DaySlot[]
  selectedTime: string
  onSelectTime: (time: string) => void
}

export function PatientDaySlotsGrid({
  daySlots,
  selectedTime,
  onSelectTime,
}: PatientDaySlotsGridProps) {
  const visible = daySlots.filter((slot) => slot.status !== "past")
  if (visible.length === 0) return null

  return (
    <div className={styles.slotsGrid}>
      {visible.map((slot) => {
        const occupied = slot.status === "occupied"
        return (
          <button
            key={slot.time}
            type="button"
            disabled={occupied}
            className={[
              styles.slotBtn,
              occupied ? styles.slotBtnOccupied : "",
              selectedTime === slot.time ? styles.slotBtnActive : "",
            ].filter(Boolean).join(" ")}
            onClick={() => {
              if (!occupied) onSelectTime(slot.time)
            }}
            aria-label={occupied ? `${slot.time} — horário ocupado` : `${slot.time} — disponível`}
          >
            <span className={styles.slotTime}>{slot.time}</span>
            {occupied && <span className={styles.slotOccupiedLabel}>Ocupado</span>}
          </button>
        )
      })}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getAvailableSlots, PATIENT_SLOT_OPTIONS } from "../../../services/appointments"
import {
  getDoctorAvailability,
  isDateOnDoctorSchedule,
  slotDurationForDateTime,
  summarizeDoctorWeekdays,
  type DoctorAvailability,
} from "../../../services/availability"
import { Button } from "../Button/Button"
import { Input } from "../Input/Input"
import { Modal } from "../Modal/Modal"
import type { Appointment } from "../../../types"
import bookStyles from "../PatientBookAppointment/PatientBookAppointmentModal.module.css"

interface PatientRescheduleModalProps {
  isOpen: boolean
  onClose: () => void
  appointment: Appointment | null
  onReschedule: (appointment: Appointment) => Promise<void>
  onSuccess?: () => void
}

const APPOINTMENT_TYPE = "presencial"

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isPastDateTime(date: string, time: string): boolean {
  const dt = new Date(`${date}T${time}:00`)
  return Number.isNaN(dt.getTime()) || dt <= new Date()
}

export function PatientRescheduleModal({
  isOpen,
  onClose,
  appointment,
  onReschedule,
  onSuccess,
}: PatientRescheduleModalProps) {
  const today = todayStr()
  const slotRequestRef = useRef(0)

  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [doctorSchedule, setDoctorSchedule] = useState<DoctorAvailability[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const scheduleSummary = useMemo(
    () => summarizeDoctorWeekdays(doctorSchedule),
    [doctorSchedule],
  )

  useEffect(() => {
    if (!isOpen || !appointment) return
    setDate(appointment.date)
    setTime(appointment.time)
    setFormError(null)
    setSlotsError(null)
  }, [isOpen, appointment])

  useEffect(() => {
    if (!isOpen || !appointment?.doctorId) {
      setDoctorSchedule([])
      return
    }

    let alive = true
    setScheduleLoading(true)
    getDoctorAvailability(appointment.doctorId)
      .then((rows) => {
        if (!alive) return
        setDoctorSchedule(rows.filter((row) => row.active))
      })
      .catch(() => {
        if (alive) setDoctorSchedule([])
      })
      .finally(() => {
        if (alive) setScheduleLoading(false)
      })

    return () => { alive = false }
  }, [isOpen, appointment?.doctorId])

  const loadSlots = useCallback(async (doctorId: string, nextDate: string, schedule: DoctorAvailability[]) => {
    if (!doctorId || !nextDate) {
      setAvailableSlots([])
      setSlotsLoading(false)
      return
    }

    if (!isDateOnDoctorSchedule(nextDate, schedule)) {
      setAvailableSlots([])
      setSlotsLoading(false)
      setSlotsError(`O médico não atende neste dia. Dias disponíveis: ${summarizeDoctorWeekdays(schedule)}.`)
      return
    }

    const requestId = slotRequestRef.current + 1
    slotRequestRef.current = requestId
    setSlotsLoading(true)
    setSlotsError(null)

    try {
      const slots = await getAvailableSlots(doctorId, nextDate, APPOINTMENT_TYPE, PATIENT_SLOT_OPTIONS)
      if (slotRequestRef.current !== requestId) return
      setAvailableSlots(slots)
      if (slots.length === 0) setSlotsError("Nenhum horário livre nesta data na agenda do médico.")
    } catch (err) {
      if (slotRequestRef.current !== requestId) return
      setAvailableSlots([])
      setSlotsError(err instanceof Error ? err.message : "Erro ao consultar horários.")
    } finally {
      if (slotRequestRef.current === requestId) setSlotsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen || !appointment?.doctorId || !date || doctorSchedule.length === 0) return
    void loadSlots(appointment.doctorId, date, doctorSchedule)
  }, [isOpen, appointment?.doctorId, date, doctorSchedule, loadSlots])

  function handleClose() {
    setFormError(null)
    onClose()
  }

  async function handleSubmit() {
    if (!appointment) return
    setFormError(null)

    if (!date) { setFormError("Selecione a data."); return }
    if (!time) { setFormError("Selecione um horário."); return }
    if (date < today || isPastDateTime(date, time)) {
      setFormError("Escolha um horário futuro.")
      return
    }
    if (!isDateOnDoctorSchedule(date, doctorSchedule)) {
      setFormError(`Este médico não atende neste dia. Atende: ${scheduleSummary}.`)
      return
    }
    if (!slotsLoading && availableSlots.length === 0) {
      setFormError("Não há horários disponíveis na agenda do médico para esta data.")
      return
    }
    if (!availableSlots.includes(time)) {
      setFormError("Selecione um horário disponível.")
      return
    }

    const duration = slotDurationForDateTime(date, time, doctorSchedule)

    setSaving(true)
    try {
      await onReschedule({
        ...appointment,
        date,
        time,
        duration,
        status: "scheduled",
      })
      onSuccess?.()
      handleClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível reagendar.")
    } finally {
      setSaving(false)
    }
  }

  if (!appointment) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Reagendar consulta"
      subtitle={`${appointment.doctorName} — ${appointment.type === "return" ? "Retorno" : "Consulta"}`}
      size="md"
      footer={(
        <>
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancelar</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? "Salvando..." : "Confirmar novo horário"}
          </Button>
        </>
      )}
    >
      <div className={bookStyles.form}>
        {formError && <div className={bookStyles.alert} role="alert">{formError}</div>}

        <Input label="Médico" value={appointment.doctorName} readOnly disabled />

        <p className={bookStyles.scheduleHint}>
          {scheduleLoading ? "Carregando agenda..." : `Agenda do médico: ${scheduleSummary}`}
        </p>

        <Input
          label="Nova data"
          type="date"
          value={date}
          min={today}
          onChange={(e) => {
            const value = e.target.value
            if (value && value < today) {
              setFormError("Selecione uma data futura.")
              return
            }
            if (value && doctorSchedule.length > 0 && !isDateOnDoctorSchedule(value, doctorSchedule)) {
              setFormError(`Este médico não atende neste dia. Atende: ${scheduleSummary}.`)
              setDate("")
              setTime("")
              return
            }
            setDate(value)
            setTime("")
            setFormError(null)
          }}
          required
        />

        <div className={bookStyles.slotsSection}>
          <p className={bookStyles.slotsLabel}>Horários disponíveis</p>
          {slotsLoading ? (
            <p className={bookStyles.slotsHint}>Consultando disponibilidade...</p>
          ) : availableSlots.length === 0 ? (
            <p className={bookStyles.slotsHint}>{slotsError ?? "Nenhum horário nesta data."}</p>
          ) : (
            <div className={bookStyles.slotsGrid}>
              {availableSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className={`${bookStyles.slotBtn} ${time === slot ? bookStyles.slotBtnActive : ""}`}
                  onClick={() => { setTime(slot); setFormError(null) }}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

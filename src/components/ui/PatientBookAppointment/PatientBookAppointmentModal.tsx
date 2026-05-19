import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getAvailableSlots } from "../../../services/appointments"
import {
  getBookableDoctors,
  getDoctorAvailability,
  isDateOnDoctorSchedule,
  slotDurationForDateTime,
  summarizeDoctorWeekdays,
  type AvailabilityDoctor,
  type DoctorAvailability,
} from "../../../services/availability"
import { Button } from "../Button/Button"
import { Input } from "../Input/Input"
import { Modal } from "../Modal/Modal"
import { Select } from "../Select/Select"
import {
  formatSpecialtyLabel,
  specialtyMatches,
  uniqueSpecialtyLabels,
} from "../../../utils"
import type { Appointment, Patient } from "../../../types"
import styles from "./PatientBookAppointmentModal.module.css"

interface PatientBookAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  patient: Patient
  onBook: (appointment: Omit<Appointment, "id">) => Promise<void>
  onSuccess?: () => void
}

const APPOINTMENT_TYPE = "presencial"
const SLOT_OPTIONS = { allowDefaultFallback: false } as const
const DEFAULT_SPECIALTY = "Clínica Geral"

function doctorSpecialty(doctor: AvailabilityDoctor): string {
  return formatSpecialtyLabel(doctor.specialty || DEFAULT_SPECIALTY)
}

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isPastDateTime(date: string, time: string): boolean {
  const dt = new Date(`${date}T${time}:00`)
  return Number.isNaN(dt.getTime()) || dt <= new Date()
}

export function PatientBookAppointmentModal({
  isOpen,
  onClose,
  patient,
  onBook,
  onSuccess,
}: PatientBookAppointmentModalProps) {
  const today = todayStr()
  const slotRequestRef = useRef(0)

  const [doctors, setDoctors] = useState<AvailabilityDoctor[]>([])
  const [doctorsLoading, setDoctorsLoading] = useState(false)
  const [doctorsError, setDoctorsError] = useState<string | null>(null)
  const [doctorSchedule, setDoctorSchedule] = useState<DoctorAvailability[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)

  const [specialty, setSpecialty] = useState("")
  const [doctorId, setDoctorId] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [observations, setObservations] = useState("")
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const resetForm = useCallback(() => {
    setSpecialty("")
    setDoctorId("")
    setDate("")
    setTime("")
    setObservations("")
    setAvailableSlots([])
    setSlotsError(null)
    setFormError(null)
    setSaving(false)
    setDoctorSchedule([])
    setScheduleLoading(false)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      resetForm()
      return
    }

    let alive = true
    setDoctorsLoading(true)
    setDoctorsError(null)

    getBookableDoctors()
      .then((list) => {
        if (!alive) return
        setDoctors(list)
        if (list.length === 0) {
          setDoctorsError("Nenhum médico com agenda cadastrada está disponível para agendamento.")
        }
      })
      .catch((err) => {
        if (!alive) return
        setDoctors([])
        setDoctorsError(err instanceof Error ? err.message : "Erro ao carregar médicos.")
      })
      .finally(() => {
        if (alive) setDoctorsLoading(false)
      })

    return () => { alive = false }
  }, [isOpen, resetForm])

  const specialties = useMemo(
    () => uniqueSpecialtyLabels(doctors.map((d) => d.specialty)),
    [doctors],
  )

  const doctorsInSpecialty = useMemo(
    () => doctors.filter((doctor) => specialtyMatches(doctorSpecialty(doctor), specialty)),
    [doctors, specialty],
  )

  const selectedDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === doctorId) ?? null,
    [doctors, doctorId],
  )

  const scheduleSummary = useMemo(
    () => summarizeDoctorWeekdays(doctorSchedule),
    [doctorSchedule],
  )

  useEffect(() => {
    if (!isOpen || !doctorId) {
      setDoctorSchedule([])
      return
    }

    let alive = true
    setScheduleLoading(true)
    getDoctorAvailability(doctorId)
      .then((rows) => {
        if (!alive) return
        const active = rows.filter((row) => row.active)
        setDoctorSchedule(active)
        if (active.length === 0) {
          setSlotsError("Este médico ainda não possui horários cadastrados na agenda.")
        }
      })
      .catch(() => {
        if (alive) setDoctorSchedule([])
      })
      .finally(() => {
        if (alive) setScheduleLoading(false)
      })

    return () => { alive = false }
  }, [isOpen, doctorId])

  const loadSlots = useCallback(async (nextDoctorId: string, nextDate: string, schedule: DoctorAvailability[]) => {
    if (!nextDoctorId || !nextDate) {
      setAvailableSlots([])
      setSlotsLoading(false)
      setSlotsError(null)
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
      const slots = await getAvailableSlots(
        nextDoctorId,
        nextDate,
        APPOINTMENT_TYPE,
        SLOT_OPTIONS,
      )
      if (slotRequestRef.current !== requestId) return
      setAvailableSlots(slots)
      if (slots.length === 0) {
        setSlotsError("Nenhum horário livre nesta data na agenda do médico. Tente outro dia.")
      }
    } catch (err) {
      if (slotRequestRef.current !== requestId) return
      setAvailableSlots([])
      setSlotsError(err instanceof Error ? err.message : "Erro ao consultar horários.")
    } finally {
      if (slotRequestRef.current === requestId) setSlotsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!doctorId || !date || doctorSchedule.length === 0) return
    void loadSlots(doctorId, date, doctorSchedule)
  }, [doctorId, date, doctorSchedule, loadSlots])

  function handleClose() {
    resetForm()
    onClose()
  }

  function handleSpecialtyChange(value: string) {
    setSpecialty(value)
    setDoctorId("")
    setDate("")
    setTime("")
    setAvailableSlots([])
    setSlotsError(null)
    setFormError(null)
  }

  function handleDoctorChange(value: string) {
    setDoctorId(value)
    setDate("")
    setTime("")
    setAvailableSlots([])
    setSlotsError(null)
    setFormError(null)
    setDoctorSchedule([])
  }

  function handleDateChange(value: string) {
    if (value && value < today) {
      setFormError("Selecione uma data futura.")
      return
    }
    if (value && doctorSchedule.length > 0 && !isDateOnDoctorSchedule(value, doctorSchedule)) {
      setFormError(`Este médico não atende neste dia. Atende: ${scheduleSummary}.`)
      setDate("")
      setTime("")
      setAvailableSlots([])
      return
    }
    setDate(value)
    setTime("")
    setFormError(null)
  }

  async function handleSubmit() {
    setFormError(null)

    if (!specialty) { setFormError("Selecione a especialidade."); return }
    if (!doctorId || !selectedDoctor) { setFormError("Selecione o médico."); return }
    if (!date) { setFormError("Selecione a data."); return }
    if (!time) { setFormError("Selecione um horário disponível."); return }
    if (date < today || isPastDateTime(date, time)) {
      setFormError("Escolha um horário futuro.")
      return
    }
    if (!slotsLoading && availableSlots.length === 0) {
      setFormError("Não há horários disponíveis na agenda do médico para esta data.")
      return
    }

    if (!availableSlots.includes(time)) {
      setFormError("Selecione um horário da lista de disponíveis.")
      return
    }

    const duration = slotDurationForDateTime(date, time, doctorSchedule)

    setSaving(true)
    try {
      await onBook({
        patientId: patient.id,
        patientName: patient.socialName || patient.name,
        doctorId: selectedDoctor.id,
        doctorName: selectedDoctor.name,
        date,
        time,
        duration,
        type: "consultation",
        status: "scheduled",
        observations: observations.trim() || undefined,
        preferredChannel: "WhatsApp",
      })
      onSuccess?.()
      handleClose()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível concluir o agendamento.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Agendar consulta"
      subtitle="Escolha especialidade, médico e horário disponível"
      size="lg"
      footer={(
        <>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || doctorsLoading}>
            {saving ? "Agendando..." : "Confirmar agendamento"}
          </Button>
        </>
      )}
    >
      <div className={styles.form}>
        {doctorsError && (
          <div className={styles.alert} role="alert">{doctorsError}</div>
        )}
        {formError && (
          <div className={styles.alert} role="alert">{formError}</div>
        )}

        <Select
          label="Especialidade"
          value={specialty}
          onChange={(e) => handleSpecialtyChange(e.target.value)}
          options={specialties}
          placeholder={doctorsLoading ? "Carregando..." : "Selecione a especialidade"}
          disabled={doctorsLoading || specialties.length === 0}
          required
        />

        <Select
          label="Médico"
          value={doctorId}
          onChange={(e) => handleDoctorChange(e.target.value)}
          options={doctorsInSpecialty.map((doctor) => ({
            value: doctor.id,
            label: doctor.crm
              ? `${doctor.name} — CRM ${doctor.crm}`
              : doctor.name,
          }))}
          placeholder={specialty ? "Selecione o médico" : "Escolha a especialidade primeiro"}
          disabled={!specialty || doctorsInSpecialty.length === 0}
          required
        />

        {doctorId && (
          <p className={styles.scheduleHint}>
            {scheduleLoading
              ? "Carregando agenda do médico..."
              : `Agenda do médico: ${scheduleSummary}`}
          </p>
        )}

        <Input
          label="Data"
          type="date"
          value={date}
          min={today}
          onChange={(e) => handleDateChange(e.target.value)}
          disabled={!doctorId}
          required
        />

        <div className={styles.slotsSection}>
          <p className={styles.slotsLabel}>
            Horários disponíveis
            {selectedDoctor && date ? ` — ${selectedDoctor.name}` : ""}
          </p>

          {!doctorId || !date ? (
            <p className={styles.slotsHint}>Selecione médico e data para ver os horários.</p>
          ) : slotsLoading ? (
            <p className={styles.slotsHint}>Consultando disponibilidade...</p>
          ) : availableSlots.length === 0 ? (
            <p className={styles.slotsHint}>{slotsError ?? "Nenhum horário nesta data."}</p>
          ) : (
            <div className={styles.slotsGrid}>
              {availableSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className={`${styles.slotBtn} ${time === slot ? styles.slotBtnActive : ""}`}
                  onClick={() => {
                    setTime(slot)
                    setFormError(null)
                  }}
                >
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className={styles.textareaLabel} htmlFor="booking-obs">
          Observações (opcional)
        </label>
        <textarea
          id="booking-obs"
          className={styles.textarea}
          rows={3}
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Sintomas, preferência de contato ou outras informações úteis"
        />
      </div>
    </Modal>
  )
}

import { useCallback, useEffect, useMemo, useState } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Button } from "../../components/ui/Button/Button"
import { Input } from "../../components/ui/Input/Input"
import { Select } from "../../components/ui/Select/Select"
import {
  createDoctorAvailability,
  deleteDoctorAvailability,
  getAvailabilityDoctors,
  getDoctorAvailability,
  updateDoctorAvailability,
} from "../../services/availability"
import type { AvailabilityDoctor, DoctorAvailability } from "../../services/availability"
import type { User } from "../../types"
import styles from "./Availability.module.css"

interface AvailabilityProps {
  currentUser: User
}

const WEEKDAYS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
]

const SLOT_OPTIONS = [
  { value: "15", label: "15 min" },
  { value: "20", label: "20 min" },
  { value: "30", label: "30 min" },
  { value: "40", label: "40 min" },
  { value: "60", label: "60 min" },
]

const APPOINTMENT_TYPES = [
  { value: "presencial", label: "Presencial" },
  { value: "telemedicina", label: "Telemedicina" },
]

function normalize(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number)
  return hours * 60 + minutes
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return timeToMinutes(startB) < timeToMinutes(endA) &&
    timeToMinutes(endB) > timeToMinutes(startA)
}

function sortAvailability(rows: DoctorAvailability[]): DoctorAvailability[] {
  return [...rows].sort((a, b) =>
    a.weekday - b.weekday ||
    a.startTime.localeCompare(b.startTime) ||
    a.appointmentType.localeCompare(b.appointmentType),
  )
}

function formatTime(value: string): string {
  return value.slice(0, 5)
}

export function Availability({ currentUser }: AvailabilityProps) {
  const isDoctor = currentUser.role === "doctor"
  const [doctors, setDoctors] = useState<AvailabilityDoctor[]>([])
  const [doctorId, setDoctorId] = useState("")
  const [availability, setAvailability] = useState<DoctorAvailability[]>([])
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(true)
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [weekday, setWeekday] = useState("1")
  const [startTime, setStartTime] = useState("08:00")
  const [endTime, setEndTime] = useState("12:00")
  const [slotMinutes, setSlotMinutes] = useState("30")
  const [appointmentType, setAppointmentType] = useState("presencial")

  const selectedDoctor = useMemo(
    () => doctors.find((doctor) => doctor.id === doctorId) ?? null,
    [doctors, doctorId],
  )
  const titleName = selectedDoctor?.name ?? currentUser.name

  useEffect(() => {
    let alive = true
    setIsLoadingDoctors(true)
    setError(null)

    getAvailabilityDoctors()
      .then((rows) => {
        if (!alive) return
        setDoctors(rows)

        const ownDoctor = rows.find((doctor) =>
          doctor.id === currentUser.id ||
          normalize(doctor.email) === normalize(currentUser.email) ||
          normalize(doctor.name) === normalize(currentUser.name) ||
          normalize(doctor.crm) === normalize(currentUser.crm))

        setDoctorId((current) => {
          if (current && rows.some((doctor) => doctor.id === current)) return current
          if (isDoctor) return ownDoctor?.id ?? ""
          return rows[0]?.id ?? ""
        })
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Erro ao carregar médicos")
      })
      .finally(() => {
        if (alive) setIsLoadingDoctors(false)
      })

    return () => { alive = false }
  }, [currentUser, isDoctor])

  const loadAvailability = useCallback(async () => {
    if (!doctorId) {
      setAvailability([])
      return
    }

    setIsLoadingAvailability(true)
    setError(null)
    try {
      const rows = await getDoctorAvailability(doctorId)
      setAvailability(sortAvailability(rows))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar disponibilidade")
    } finally {
      setIsLoadingAvailability(false)
    }
  }, [doctorId])

  useEffect(() => {
    void loadAvailability()
  }, [loadAvailability])

  function clearFeedback() {
    setError(null)
    setMessage(null)
  }

  async function handleCreateAvailability() {
    if (!doctorId) {
      setError("Não foi possível identificar o médico na tabela doctors.")
      return
    }
    if (startTime >= endTime) {
      setError("Horário inicial deve ser menor que o final.")
      return
    }

    const hasOverlap = availability.some((row) =>
      row.active &&
      row.weekday === Number(weekday) &&
      row.appointmentType === appointmentType &&
      overlaps(row.startTime, row.endTime, startTime, endTime))

    if (hasOverlap) {
      setError("Já existe uma disponibilidade sobreposta para este dia e tipo.")
      return
    }

    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const created = await createDoctorAvailability({
        doctorId,
        weekday: Number(weekday),
        startTime,
        endTime,
        slotMinutes: Number(slotMinutes),
        appointmentType,
      })
      setAvailability((prev) => sortAvailability([...prev, created]))
      setMessage("Disponibilidade criada.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar disponibilidade")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleAvailability(row: DoctorAvailability) {
    clearFeedback()
    const updated = { ...row, active: !row.active }
    try {
      await updateDoctorAvailability(updated)
      setAvailability((prev) => prev.map((item) => item.id === row.id ? updated : item))
      setMessage(updated.active ? "Disponibilidade ativada." : "Disponibilidade desativada.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar disponibilidade")
    }
  }

  async function handleDeleteAvailability(row: DoctorAvailability) {
    if (!window.confirm("Excluir esta disponibilidade?")) return
    clearFeedback()
    try {
      await deleteDoctorAvailability(row.id)
      setAvailability((prev) => prev.filter((item) => item.id !== row.id))
      setMessage("Disponibilidade removida.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover disponibilidade")
    }
  }

  const isBusy = isLoadingDoctors || isLoadingAvailability

  return (
    <div>
      <Topbar
        title="Disponibilidade médica"
        subtitle={doctorId ? `Atendimento de ${titleName}` : "Configure os horários de atendimento"}
      />

      <Card className={styles.toolbar}>
        <div className={styles.doctorField}>
          {isDoctor ? (
            <>
              <span className={styles.label}>Médico</span>
              <div className={styles.lockedDoctor}>{titleName}</div>
            </>
          ) : (
            <Select
              label="Médico"
              value={doctorId}
              onChange={(event) => { setDoctorId(event.target.value); clearFeedback() }}
              options={doctors.map((doctor) => ({ value: doctor.id, label: doctor.name }))}
              placeholder="Selecionar médico"
              disabled={isLoadingDoctors}
            />
          )}
        </div>

        <div className={styles.summary}>
          <span>{availability.filter((row) => row.active).length}</span>
          horários ativos
        </div>
      </Card>

      {(error || message) && (
        <p className={error ? styles.error : styles.success}>{error ?? message}</p>
      )}

      <div className={styles.grid}>
        <Card className={styles.formCard}>
          <h3 className={styles.cardTitle}>Nova disponibilidade</h3>
          <div className={styles.formGrid}>
            <Select
              label="Dia"
              value={weekday}
              onChange={(event) => { setWeekday(event.target.value); clearFeedback() }}
              options={WEEKDAYS}
            />
            <Select
              label="Tipo"
              value={appointmentType}
              onChange={(event) => { setAppointmentType(event.target.value); clearFeedback() }}
              options={APPOINTMENT_TYPES}
            />
            <Input
              label="Início"
              type="time"
              value={startTime}
              onChange={(event) => { setStartTime(event.target.value); clearFeedback() }}
            />
            <Input
              label="Fim"
              type="time"
              value={endTime}
              onChange={(event) => { setEndTime(event.target.value); clearFeedback() }}
            />
            <div className={styles.fullRow}>
              <Select
                label="Intervalo"
                value={slotMinutes}
                onChange={(event) => { setSlotMinutes(event.target.value); clearFeedback() }}
                options={SLOT_OPTIONS}
              />
            </div>
          </div>
          <div className={styles.formActions}>
            <Button onClick={handleCreateAvailability} disabled={isSaving || !doctorId}>
              {isSaving ? "Salvando..." : "Criar disponibilidade"}
            </Button>
          </div>
        </Card>

        <Card className={styles.listCard}>
          <h3 className={styles.cardTitle}>Horários cadastrados</h3>
          {isBusy ? (
            <p className={styles.empty}>Carregando...</p>
          ) : !doctorId ? (
            <p className={styles.empty}>Médico não encontrado na API de doctors.</p>
          ) : availability.length === 0 ? (
            <p className={styles.empty}>Nenhuma disponibilidade cadastrada.</p>
          ) : (
            <div className={styles.rows}>
              {availability.map((row) => (
                <div key={row.id} className={`${styles.row} ${!row.active ? styles.rowInactive : ""}`}>
                  <div className={styles.rowMain}>
                    <span className={row.active ? styles.activeDot : styles.inactiveDot} />
                    <div>
                      <p className={styles.rowTitle}>{WEEKDAYS[row.weekday]?.label ?? "Dia"}</p>
                      <p className={styles.rowSub}>
                        {formatTime(row.startTime)} - {formatTime(row.endTime)} · {row.slotMinutes} min · {row.appointmentType}
                      </p>
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <Button size="sm" variant="ghost" onClick={() => handleToggleAvailability(row)}>
                      {row.active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDeleteAvailability(row)}>
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

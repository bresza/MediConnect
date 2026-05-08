import { useCallback, useEffect, useState } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Button } from "../../components/ui/Button/Button"
import { Input } from "../../components/ui/Input/Input"
import { Select } from "../../components/ui/Select/Select"
import {
  createDoctorAvailability,
  createDoctorException,
  deleteDoctorAvailability,
  getAvailabilityDoctors,
  getDoctorAvailability,
  getDoctorExceptions,
  updateDoctorAvailability,
} from "../../services/availability"
import type { AvailabilityDoctor, DoctorAvailability, DoctorException } from "../../services/availability"
import type { User } from "../../types"
import styles from "./Availability.module.css"

interface AvailabilityProps {
  currentUser: User
}

type Tab = "availability" | "exceptions"

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function today() {
  return new Date().toISOString().slice(0, 10)
}

function doctorName(doctors: AvailabilityDoctor[], id: string, currentUser: User) {
  if (id === currentUser.doctorId || id === currentUser.id) return currentUser.name
  return doctors.find((doctor) => doctor.id === id)?.name ?? "Médico"
}

function sameText(a?: string, b?: string): boolean {
  return Boolean(a && b && a.toLowerCase().trim() === b.toLowerCase().trim())
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number)
  return hours * 60 + minutes
}

function overlaps(
  existingStart: string,
  existingEnd: string,
  nextStart: string,
  nextEnd: string,
): boolean {
  return timeToMinutes(nextStart) < timeToMinutes(existingEnd) &&
    timeToMinutes(nextEnd) > timeToMinutes(existingStart)
}

export function Availability({ currentUser }: AvailabilityProps) {
  const isDoctor = currentUser.role === "doctor"

  const [tab, setTab] = useState<Tab>("availability")
  const [doctors, setDoctors] = useState<AvailabilityDoctor[]>([])
  const [doctorId, setDoctorId] = useState("")
  const [availability, setAvailability] = useState<DoctorAvailability[]>([])
  const [exceptions, setExceptions] = useState<DoctorException[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [weekday, setWeekday] = useState("1")
  const [startTime, setStartTime] = useState("08:00")
  const [endTime, setEndTime] = useState("12:00")
  const [slotMinutes, setSlotMinutes] = useState("30")
  const [appointmentType, setAppointmentType] = useState("presencial")

  const [exceptionDate, setExceptionDate] = useState(today())
  const [exceptionStart, setExceptionStart] = useState("08:00")
  const [exceptionEnd, setExceptionEnd] = useState("12:00")
  const [exceptionReason, setExceptionReason] = useState("")

  const selectedDoctorName = doctorName(doctors, doctorId, currentUser)
  const selectedDoctor = doctors.find((doctor) => doctor.id === doctorId)

  useEffect(() => {
    let alive = true
    setError(null)
    getAvailabilityDoctors()
      .then((rows) => {
        if (!alive) return
        setDoctors(rows)
        const ownDoctor = rows.find((doctor) =>
          doctor.id === currentUser.doctorId ||
          doctor.id === currentUser.id ||
          sameText(doctor.email, currentUser.email) ||
          sameText(doctor.name, currentUser.name) ||
          sameText(doctor.crm, currentUser.crm))

        if (isDoctor) {
          setDoctorId(ownDoctor?.id ?? "")
        } else {
          setDoctorId((current) => current && rows.some((doctor) => doctor.id === current)
            ? current
            : rows[0]?.id ?? "")
        }
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Erro ao carregar médicos")
      })
    return () => { alive = false }
  }, [currentUser, isDoctor])

  const load = useCallback(async () => {
    if (!doctorId) {
      setAvailability([])
      setExceptions([])
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const [availableRows, exceptionRows] = await Promise.all([
        getDoctorAvailability(doctorId),
        getDoctorExceptions(doctorId),
      ])
      setAvailability(availableRows)
      setExceptions(exceptionRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar disponibilidade")
    } finally {
      setIsLoading(false)
    }
  }, [doctorId])

  useEffect(() => { void load() }, [load])

  async function handleCreateAvailability() {
    if (!doctorId) { setError("Selecione o médico."); return }
    if (!UUID_RE.test(doctorId)) {
      setError("Selecione um médico retornado por /rest/v1/doctors antes de criar disponibilidade.")
      return
    }
    if (!selectedDoctor?.crm) {
      setError("Médico selecionado sem CRM na API de doctors.")
      return
    }
    if (startTime >= endTime) { setError("Horário inicial deve ser menor que o final."); return }
    const hasOverlap = availability.some((row) =>
      row.active &&
      row.doctorId === doctorId &&
      row.weekday === Number(weekday) &&
      row.appointmentType === appointmentType &&
      overlaps(row.startTime.slice(0, 5), row.endTime.slice(0, 5), startTime, endTime))
    if (hasOverlap) {
      setError("Já existe disponibilidade sobreposta para este médico no mesmo dia e tipo.")
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
      setAvailability((prev) => [...prev, created].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)))
      setMessage("Disponibilidade criada.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar disponibilidade")
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleAvailability(row: DoctorAvailability) {
    const updated = { ...row, active: !row.active }
    await updateDoctorAvailability(updated)
    setAvailability((prev) => prev.map((item) => item.id === row.id ? updated : item))
  }

  async function removeAvailability(id: string) {
    if (!window.confirm("Excluir esta disponibilidade?")) return
    await deleteDoctorAvailability(id)
    setAvailability((prev) => prev.filter((row) => row.id !== id))
  }

  async function handleCreateException() {
    if (!doctorId) { setError("Selecione o médico."); return }
    if (!exceptionDate) { setError("Informe a data da exceção."); return }
    if (exceptionStart && exceptionEnd && exceptionStart >= exceptionEnd) {
      setError("Horário inicial da exceção deve ser menor que o final.")
      return
    }

    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const created = await createDoctorException({
        doctorId,
        date: exceptionDate,
        startTime: exceptionStart,
        endTime: exceptionEnd,
        reason: exceptionReason.trim() || undefined,
      })
      setExceptions((prev) => [...prev, created].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? "")))
      setExceptionReason("")
      setMessage("Exceção criada.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar exceção")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <Topbar
        title="Disponibilidade médica"
        subtitle={doctorId ? selectedDoctorName : "Selecione um profissional"}
      />

      <Card className={styles.toolbar}>
        <div className={styles.doctorPicker}>
          {isDoctor ? (
            <div>
              <span className={styles.label}>Médico</span>
              <div className={styles.lockedDoctor}>{currentUser.name}</div>
            </div>
          ) : (
            <Select
              label="Médico"
              value={doctorId}
              onChange={(event) => { setDoctorId(event.target.value); setMessage(null); setError(null) }}
              options={doctors.map((doctor) => ({ value: doctor.id, label: doctor.name }))}
              placeholder="Selecionar médico"
            />
          )}
        </div>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "availability" ? styles.tabActive : ""}`} onClick={() => setTab("availability")}>
            Disponibilidades
          </button>
          <button className={`${styles.tab} ${tab === "exceptions" ? styles.tabActive : ""}`} onClick={() => setTab("exceptions")}>
            Exceções
          </button>
        </div>
      </Card>

      {(error || message) && (
        <p className={error ? styles.error : styles.success}>{error ?? message}</p>
      )}

      {tab === "availability" ? (
        <div className={styles.grid}>
          <Card className={styles.formCard}>
            <h3 className={styles.cardTitle}>Nova disponibilidade</h3>
            <div className={styles.formGrid}>
              <Select label="Dia da semana" value={weekday} onChange={(event) => setWeekday(event.target.value)} options={WEEKDAYS} />
              <Select label="Tipo" value={appointmentType} onChange={(event) => setAppointmentType(event.target.value)} options={APPOINTMENT_TYPES} />
              <Input label="Horário inicial" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              <Input label="Horário final" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              <Select label="Intervalo" value={slotMinutes} onChange={(event) => setSlotMinutes(event.target.value)} options={SLOT_OPTIONS} />
            </div>
            <Button onClick={handleCreateAvailability} disabled={isSaving || !doctorId}>
              {isSaving ? "Salvando..." : "Criar disponibilidade"}
            </Button>
          </Card>

          <Card className={styles.listCard}>
            <h3 className={styles.cardTitle}>Horários cadastrados</h3>
            {isLoading ? (
              <p className={styles.empty}>Carregando...</p>
            ) : availability.length === 0 ? (
              <p className={styles.empty}>Nenhuma disponibilidade cadastrada.</p>
            ) : (
              <div className={styles.rows}>
                {availability.map((row) => (
                  <div key={row.id} className={styles.row}>
                    <div>
                      <p className={styles.rowTitle}>{WEEKDAYS[row.weekday]?.label ?? row.weekday}</p>
                      <p className={styles.rowSub}>{row.startTime.slice(0, 5)} - {row.endTime.slice(0, 5)} · {row.slotMinutes} min · {row.appointmentType}</p>
                    </div>
                    <div className={styles.actions}>
                      <Button size="sm" variant="ghost" onClick={() => toggleAvailability(row)}>
                        {row.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => removeAvailability(row.id)}>Excluir</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : (
        <div className={styles.grid}>
          <Card className={styles.formCard}>
            <h3 className={styles.cardTitle}>Nova exceção</h3>
            <div className={styles.formGrid}>
              <Input label="Data" type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} />
              <Input label="Horário inicial" type="time" value={exceptionStart} onChange={(event) => setExceptionStart(event.target.value)} />
              <Input label="Horário final" type="time" value={exceptionEnd} onChange={(event) => setExceptionEnd(event.target.value)} />
              <Input label="Motivo" value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} placeholder="Ex: congresso, feriado, bloqueio" />
            </div>
            <Button onClick={handleCreateException} disabled={isSaving || !doctorId}>
              {isSaving ? "Salvando..." : "Criar exceção"}
            </Button>
          </Card>

          <Card className={styles.listCard}>
            <h3 className={styles.cardTitle}>Exceções cadastradas</h3>
            {isLoading ? (
              <p className={styles.empty}>Carregando...</p>
            ) : exceptions.length === 0 ? (
              <p className={styles.empty}>Nenhuma exceção cadastrada.</p>
            ) : (
              <div className={styles.rows}>
                {exceptions.map((row) => (
                  <div key={row.id} className={styles.row}>
                    <div>
                      <p className={styles.rowTitle}>{new Date(`${row.date}T00:00:00`).toLocaleDateString("pt-BR")}</p>
                      <p className={styles.rowSub}>{row.startTime?.slice(0, 5) ?? "00:00"} - {row.endTime?.slice(0, 5) ?? "23:59"}{row.reason ? ` · ${row.reason}` : ""}</p>
                    </div>
                    <span className={styles.badge}>Bloqueio</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

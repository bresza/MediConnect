import { useCallback, useEffect, useMemo, useState } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Button } from "../../components/ui/Button/Button"
import { Badge } from "../../components/ui/Badge/Badge"
import { Input } from "../../components/ui/Input/Input"
import { Select } from "../../components/ui/Select/Select"
import { SearchSelect } from "../../components/ui/SearchSelect/SearchSelect"
import { Modal } from "../../components/ui/Modal/Modal"
import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog"
import { RefreshButton } from "../../components/ui/RefreshButton/RefreshButton"
import {
  createDoctorAvailability,
  deleteDoctorAvailability,
  getAvailabilityDoctors,
  getDoctorAvailability,
  updateDoctorAvailability,
} from "../../services/availability"
import type { AvailabilityDoctor, DoctorAvailability } from "../../services/availability"
import type { User } from "../../types"
import { formatRecordStatus } from "../../utils/statusLabels"
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

function formatTypeLabel(value: string): string {
  return APPOINTMENT_TYPES.find((item) => item.value === value)?.label ?? value
}

const PlusIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const TrashIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
)

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
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DoctorAvailability | null>(null)

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

  const activeCount = availability.filter((row) => row.active).length
  const inactiveCount = availability.length - activeCount

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

  const handleRefresh = useCallback(async () => {
    await loadAvailability()
  }, [loadAvailability])

  function clearFeedback() {
    setError(null)
    setMessage(null)
  }

  function openCreateModal() {
    clearFeedback()
    setCreateModalOpen(true)
  }

  function closeCreateModal() {
    if (isSaving) return
    setCreateModalOpen(false)
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
      setCreateModalOpen(false)
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

  const headerAction = (
    <div className={styles.headerActions}>
      <RefreshButton onRefresh={handleRefresh} />
      <Button icon={<PlusIcon />} onClick={openCreateModal} disabled={!doctorId || isLoadingDoctors}>
        Nova disponibilidade
      </Button>
    </div>
  )

  return (
    <div className={styles.page}>
      <Topbar
        title="Disponibilidade médica"
        subtitle={doctorId ? `Atendimento de ${titleName}` : "Configure os horários de atendimento"}
        action={headerAction}
      />

      <div className={styles.intro}>
        <p>
          Defina os <strong>dias e horários</strong> em que o médico atende.
          Esses blocos alimentam a agenda e a busca de horários no portal do paciente.
        </p>
      </div>

      {(error || message) && (
        <p className={error ? styles.feedbackError : styles.feedbackSuccess} role="status">
          {error ?? message}
        </p>
      )}

      <Card className={styles.filterCard}>
        <div className={styles.filterMain}>
          {isDoctor ? (
            <div className={styles.doctorLocked}>
              <span className={styles.fieldLabel}>Médico</span>
              <div className={styles.lockedDoctor}>{titleName}</div>
            </div>
          ) : (
            <SearchSelect
              label="Médico"
              value={doctorId}
              onChange={(event) => { setDoctorId(event.target.value); clearFeedback() }}
              options={doctors.map((doctor) => ({ value: doctor.id, label: doctor.name }))}
              placeholder="Selecionar médico"
              searchPlaceholder="Buscar médico..."
              disabled={isLoadingDoctors}
            />
          )}
          {selectedDoctor?.specialty && (
            <p className={styles.specialtyHint}>{selectedDoctor.specialty}</p>
          )}
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span>{activeCount}</span>
            <small>Ativos</small>
          </div>
          <div className={styles.stat}>
            <span>{inactiveCount}</span>
            <small>Inativos</small>
          </div>
          <div className={styles.stat}>
            <span>{availability.length}</span>
            <small>Total</small>
          </div>
        </div>
      </Card>

      <Card className={styles.listCard}>
        <header className={styles.listHeader}>
          <div>
            <h2>Horários cadastrados</h2>
            <p>Blocos semanais usados para gerar slots de agendamento.</p>
          </div>
        </header>

        {isBusy ? (
          <p className={styles.empty}>Carregando disponibilidade...</p>
        ) : !doctorId ? (
          <p className={styles.empty}>Médico não encontrado na API de doctors.</p>
        ) : availability.length === 0 ? (
          <div className={styles.empty}>
            <strong>Nenhuma disponibilidade cadastrada</strong>
            <span>Crie o primeiro bloco de atendimento para este médico.</span>
            <Button icon={<PlusIcon />} onClick={openCreateModal}>
              Nova disponibilidade
            </Button>
          </div>
        ) : (
          <ul className={styles.rows}>
            {availability.map((row) => (
              <li key={row.id} className={`${styles.row} ${!row.active ? styles.rowInactive : ""}`}>
                <div className={styles.rowMain}>
                  <div className={styles.rowWhen}>
                    <strong>{WEEKDAYS[row.weekday]?.label ?? "Dia"}</strong>
                    <span>{formatTime(row.startTime)} – {formatTime(row.endTime)}</span>
                  </div>
                  <div className={styles.rowInfo}>
                    <p>{formatTypeLabel(row.appointmentType)}</p>
                    <span>Intervalo de {row.slotMinutes} min</span>
                  </div>
                  <div className={styles.rowAside}>
                    <Badge>{formatRecordStatus(row.active ? "Active" : "Inactive")}</Badge>
                  </div>
                </div>
                <div className={styles.rowActions}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleToggleAvailability(row)}
                  >
                    {row.active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className={styles.deleteBtn}
                    icon={<TrashIcon />}
                    onClick={() => setDeleteTarget(row)}
                  >
                    Excluir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        isOpen={createModalOpen}
        onClose={closeCreateModal}
        title="Nova disponibilidade"
        subtitle={titleName ? `Para ${titleName}` : undefined}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={closeCreateModal} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={() => void handleCreateAvailability()} disabled={isSaving || !doctorId} loading={isSaving}>
              {isSaving ? "Salvando..." : "Criar disponibilidade"}
            </Button>
          </>
        }
      >
        <div className={styles.formGrid}>
          <Select
            label="Dia da semana"
            value={weekday}
            onChange={(event) => { setWeekday(event.target.value); clearFeedback() }}
            options={WEEKDAYS}
          />
          <Select
            label="Tipo de atendimento"
            value={appointmentType}
            onChange={(event) => { setAppointmentType(event.target.value); clearFeedback() }}
            options={APPOINTMENT_TYPES}
          />
          <Input
            label="Horário inicial"
            type="time"
            value={startTime}
            onChange={(event) => { setStartTime(event.target.value); clearFeedback() }}
          />
          <Input
            label="Horário final"
            type="time"
            value={endTime}
            onChange={(event) => { setEndTime(event.target.value); clearFeedback() }}
          />
          <div className={styles.fullRow}>
            <Select
              label="Duração de cada slot"
              value={slotMinutes}
              onChange={(event) => { setSlotMinutes(event.target.value); clearFeedback() }}
              options={SLOT_OPTIONS}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void handleDeleteAvailability(deleteTarget)
        }}
        title="Excluir disponibilidade"
        message={
          deleteTarget
            ? `Remover ${WEEKDAYS[deleteTarget.weekday]?.label ?? "este dia"}, ${formatTime(deleteTarget.startTime)} – ${formatTime(deleteTarget.endTime)}?`
            : "Remover esta disponibilidade?"
        }
        confirmLabel="Excluir"
        variant="danger"
      />
    </div>
  )
}

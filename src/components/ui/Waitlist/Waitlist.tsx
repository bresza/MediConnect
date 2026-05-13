import { useEffect, useMemo, useState } from "react"
import { Button } from "../Button/Button"
import { Modal } from "../Modal/Modal"
import { Select } from "../Select/Select"
import { Input } from "../Input/Input"
import { Textarea } from "../Textarea/Textarea"
import { EmptyState } from "../EmptyState/EmptyState"
import { Card } from "../Card/Card"
import {
  inferPriority, WAITLIST_COLOR_HEX, WAITLIST_COLOR_LABEL,
  type InferPriorityResult,
} from "../../../services/waitlist"
import type {
  Patient, User, WaitlistEntry, WaitlistLegalFlags, WaitlistPriorityColor,
} from "../../../types"
import styles from "./Waitlist.module.css"

interface WaitlistPanelProps {
  /** Lista já filtrada/ordenada conforme o perfil. */
  entries:        WaitlistEntry[]
  patients:       Patient[]
  /** Lista de médicos para o seletor (ex.: vinda de getAppointmentDoctors). */
  doctors:        { id: string; name: string }[]
  currentUser:    User
  /** True quando o perfil pode adicionar/editar/remover. */
  canManage:      boolean
  loading?:       boolean
  error?:         string | null
  onAdd:          (input: AddWaitlistInput) => Promise<void> | void
  onUpdate:       (entry: WaitlistEntry) => Promise<void> | void
  onRemove:       (id: string) => Promise<void> | void
  /** Quando uma sugestão é "aceita" (clica em Agendar), o painel só comunica — o pai abre o modal de agendamento. */
  onScheduleFromEntry?: (entry: WaitlistEntry) => void
}

export interface AddWaitlistInput {
  patientId:     string
  patientName:   string
  specialty?:    string
  doctorId?:     string
  doctorName?:   string
  cid10?:        string
  clinicalNotes?: string
  flags:         WaitlistLegalFlags
  notes?:        string
  addedBy?:      string
  addedByName?:  string
  inferred:      InferPriorityResult
}

function formatDate(iso: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("pt-BR")
}

function daysUntil(iso: string): number {
  const due = new Date(iso)
  if (Number.isNaN(due.getTime())) return Number.POSITIVE_INFINITY
  return Math.ceil((due.getTime() - Date.now()) / 86_400_000)
}

const FLAG_LABELS: Record<keyof WaitlistLegalFlags, string> = {
  elderly:         "Idoso(a)",
  pregnant:        "Gestante",
  lactating:       "Lactante",
  infantInArms:    "Criança de colo",
  disability:      "PcD",
  asd:             "TEA",
  severeObesity:   "Obesidade severa",
  reducedMobility: "Mobilidade reduzida",
}

const ALL_FLAGS = Object.keys(FLAG_LABELS) as (keyof WaitlistLegalFlags)[]

function PriorityBadge({ color }: { color: WaitlistPriorityColor }) {
  return (
    <span className={styles.colorDot}>
      <span style={{ background: WAITLIST_COLOR_HEX[color] }} />
      {WAITLIST_COLOR_LABEL[color]}
    </span>
  )
}

function FlagsCell({ flags }: { flags: WaitlistLegalFlags }) {
  const active = ALL_FLAGS.filter((f) => flags[f])
  if (active.length === 0) return <span style={{ color: "var(--muted-foreground)" }}>—</span>
  return (
    <>
      {active.map((f) => (
        <span key={f} className={styles.flagPill}>{FLAG_LABELS[f]}</span>
      ))}
    </>
  )
}

function DueByCell({ iso }: { iso: string }) {
  const days = daysUntil(iso)
  const label = formatDate(iso)
  if (days < 0) return <span className={styles.dueOverdue}>{label} (atrasado)</span>
  if (days <= 7) return <span className={styles.dueSoon}>{label} ({days}d)</span>
  return <span>{label}</span>
}

export function WaitlistPanel(props: WaitlistPanelProps) {
  const { entries, loading, error, canManage } = props
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className={styles.root}>
      <div className={styles.headerRow}>
        <div>
          <p className={styles.title}>Fila de espera por prioridade</p>
          <p className={styles.subtitle}>
            Em caso de desistência ou cancelamento, o sistema sugere automaticamente o próximo
            paciente prioritário. Cores seguem o protocolo de regulação ambulatorial do SUS;
            prioridades legais (Lei 10.048/2000) elevam a posição na fila.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowAdd(true)} size="sm">
            + Adicionar à fila
          </Button>
        )}
      </div>

      <div className={styles.legendRow}>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: WAITLIST_COLOR_HEX.red }} />
          Vermelho — até 1 mês
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: WAITLIST_COLOR_HEX.yellow }} />
          Amarelo — até 3 meses
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: WAITLIST_COLOR_HEX.green }} />
          Verde — até 6 meses
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: WAITLIST_COLOR_HEX.blue }} />
          Azul — até 1 ano
        </span>
      </div>

      {error && (
        <Card>
          <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>{error}</p>
        </Card>
      )}

      {loading && entries.length === 0 ? (
        <div className={styles.empty}>Carregando fila…</div>
      ) : entries.length === 0 ? (
        <EmptyState
          title="Sem pacientes na fila"
          description={canManage ? "Adicione pacientes que precisam aguardar vaga e o sistema cuida da ordem de prioridade." : "Nenhum paciente aguardando vaga no momento."}
        />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Paciente</th>
              <th>Prioridade</th>
              <th>Prioridades legais</th>
              <th>CID</th>
              <th>Profissional / Especialidade</th>
              <th>Entrou em</th>
              <th>Prazo-alvo</th>
              {canManage && <th>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <strong>{entry.patientName}</strong>
                  {entry.clinicalNotes && (
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                      {entry.clinicalNotes}
                    </div>
                  )}
                </td>
                <td><PriorityBadge color={entry.priorityColor} /></td>
                <td><FlagsCell flags={entry.flags} /></td>
                <td>{entry.cid10 ?? "—"}</td>
                <td>
                  {entry.doctorName ?? (entry.specialty ?? "—")}
                  {entry.doctorName && entry.specialty && (
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
                      {entry.specialty}
                    </div>
                  )}
                </td>
                <td>{formatDate(entry.enteredAt)}</td>
                <td><DueByCell iso={entry.dueBy} /></td>
                {canManage && (
                  <td>
                    <div className={styles.actions}>
                      {props.onScheduleFromEntry && (
                        <Button size="sm" variant="primary" onClick={() => props.onScheduleFromEntry?.(entry)}>
                          Agendar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => {
                        void props.onUpdate({ ...entry, status: "removed" })
                      }}>Remover</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAdd && (
        <AddWaitlistModal
          patients={props.patients}
          doctors={props.doctors}
          currentUser={props.currentUser}
          onCancel={() => setShowAdd(false)}
          onConfirm={async (input) => {
            await props.onAdd(input)
            setShowAdd(false)
          }}
        />
      )}
    </div>
  )
}

interface AddWaitlistModalProps {
  patients:    Patient[]
  doctors:     { id: string; name: string }[]
  currentUser: User
  onCancel:    () => void
  onConfirm:   (input: AddWaitlistInput) => Promise<void> | void
}

function AddWaitlistModal({ patients, doctors, currentUser, onCancel, onConfirm }: AddWaitlistModalProps) {
  const [patientId, setPatientId] = useState("")
  const [doctorId, setDoctorId]   = useState("")
  const [specialty, setSpecialty] = useState("")
  const [cid10, setCid10]         = useState("")
  const [notes, setNotes]         = useState("")
  const [flags, setFlags]         = useState<WaitlistLegalFlags>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const patient = useMemo(() => patients.find((p) => p.id === patientId), [patientId, patients])
  const doctor  = useMemo(() => doctors.find((d) => d.id === doctorId), [doctorId, doctors])

  const inferred = useMemo<InferPriorityResult>(() => inferPriority({
    patient: patient ? { dob: patient.dob, gender: patient.gender } : undefined,
    flags,
    cid10,
    notes,
  }), [patient, flags, cid10, notes])

  // Sincroniza flags auto-detectadas (ex.: idoso por idade) no checkbox.
  useEffect(() => {
    setFlags((prev) => ({ ...prev, ...inferred.flags }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  function toggleFlag(flag: keyof WaitlistLegalFlags, on: boolean) {
    setFlags((prev) => ({ ...prev, [flag]: on || undefined }))
  }

  async function handleSubmit() {
    if (!patient) { setError("Selecione um paciente."); return }
    setError(null)
    setSubmitting(true)
    try {
      await onConfirm({
        patientId:    patient.id,
        patientName:  patient.name,
        specialty:    specialty || undefined,
        doctorId:     doctor?.id,
        doctorName:   doctor?.name,
        cid10:        cid10 || undefined,
        clinicalNotes: notes || undefined,
        flags:        inferred.flags,
        notes:        undefined,
        addedBy:      currentUser.id,
        addedByName:  currentUser.name,
        inferred,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar à fila.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="Adicionar paciente à fila"
      subtitle="A cor de prioridade é calculada automaticamente."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>Cancelar</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Adicionando…" : "Adicionar"}
          </Button>
        </>
      }
    >
      <div className={styles.formGrid}>
        <div className={styles.full}>
          <Select
            label="Paciente"
            options={patients.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Selecione"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
          />
        </div>

        <Select
          label="Profissional (opcional)"
          options={doctors.map((d) => ({ value: d.id, label: d.name }))}
          placeholder="Qualquer profissional"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
        />
        <Input label="Especialidade (opcional)" value={specialty} onChange={(e) => setSpecialty(e.target.value)} />

        <Input label="CID-10 (opcional)" value={cid10} onChange={(e) => setCid10(e.target.value.toUpperCase().slice(0, 8))} />
        <div /> {/* spacer */}

        <div className={styles.full}>
          <Textarea
            label="Queixa / observações clínicas"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: dor torácica há 3 dias, hipertensão descompensada."
            rows={3}
          />
        </div>

        <div className={styles.full}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Prioridades legais aplicáveis</span>
          <div className={styles.flagsBox}>
            {ALL_FLAGS.map((flag) => (
              <label key={flag}>
                <input
                  type="checkbox"
                  checked={!!flags[flag]}
                  onChange={(e) => toggleFlag(flag, e.target.checked)}
                />
                {FLAG_LABELS[flag]}
              </label>
            ))}
          </div>
        </div>

        <div className={`${styles.full} ${styles.inferBox}`}>
          <div>
            <strong>Cor inferida: </strong>
            <PriorityBadge color={inferred.color} />
          </div>
          {inferred.reasons.length > 0 && (
            <ul className={styles.inferReasons}>
              {inferred.reasons.map((r, idx) => (<li key={idx}>{r}</li>))}
            </ul>
          )}
        </div>

        {error && <p style={{ color: "#b91c1c", fontSize: 12, margin: 0 }}>{error}</p>}
      </div>
    </Modal>
  )
}

// ─── Modal de sugestão (acionado ao cancelar/ausência) ────────────

interface SuggestionModalProps {
  isOpen:        boolean
  entry:         WaitlistEntry | null
  onCancel:      () => void
  onAccept:      (entry: WaitlistEntry) => void
  onDismissEntry?: (entry: WaitlistEntry) => void
}

export function WaitlistSuggestionModal({ isOpen, entry, onCancel, onAccept, onDismissEntry }: SuggestionModalProps) {
  if (!entry) return null
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Vaga liberada — sugestão da fila"
      subtitle="Paciente com maior prioridade compatível com o horário liberado."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Fechar</Button>
          {onDismissEntry && (
            <Button variant="outline" onClick={() => onDismissEntry(entry)}>
              Próximo da fila
            </Button>
          )}
          <Button variant="primary" onClick={() => onAccept(entry)}>
            Agendar este paciente
          </Button>
        </>
      }
    >
      <div className={styles.suggestionCard}>
        <p className={styles.suggestionTitle}>{entry.patientName}</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <PriorityBadge color={entry.priorityColor} />
          <FlagsCell flags={entry.flags} />
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          Aguarda desde {formatDate(entry.enteredAt)} · prazo-alvo {formatDate(entry.dueBy)}
        </div>
        {entry.clinicalNotes && (
          <p style={{ fontSize: 12, margin: 0 }}>
            <strong>Queixa:</strong> {entry.clinicalNotes}
          </p>
        )}
        {entry.cid10 && (
          <p style={{ fontSize: 12, margin: 0 }}>
            <strong>CID-10:</strong> {entry.cid10}
          </p>
        )}
      </div>
    </Modal>
  )
}

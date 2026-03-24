import { useState, useEffect } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Select } from "../../components/ui/Select/Select"
import { formatAppointmentType, checkConflict } from "../../utils"
import type { Appointment, Patient } from "../../types"
import styles from "./Appointments.module.css"

type CalendarView = "day" | "week" | "month"

const HOURS      = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00","15:30","16:00","16:30","17:00"]
const DAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
const DOCTORS    = ["Dr. Roberto Farias", "Dra. Carla Nunes"]

const PlusIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"
    viewBox="0 0 24 24" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const BLOCK_STYLE: Record<string, string> = {
  confirmed: styles.appointmentBlockConfirmed,
  pending:   styles.appointmentBlockPending,
  absent:    styles.appointmentBlockAbsent,
}

// ─── Modal form state ──────────────────────────────────────────────
interface ModalForm {
  date: string
  time: string
  patientName: string
  doctorName: string
  type: string
  duration: string
  channel: string
  observations: string
}

const EMPTY_MODAL: ModalForm = {
  date: "2026-03-18", time: "", patientName: "",
  doctorName: "", type: "", duration: "30", channel: "", observations: "",
}

interface AppointmentsProps {
  appointments: Appointment[]
  patients: Patient[]
  onAddAppointment: (a: Appointment) => void
}

export function Appointments({ appointments, patients, onAddAppointment }: AppointmentsProps) {
  const [view, setView]           = useState<CalendarView>("day")
  const [selected, setSelected]   = useState<Appointment | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [filterDoctor, setFilterDoctor] = useState("")
  const [modal, setModal]         = useState<ModalForm>(EMPTY_MODAL)
  const [conflict, setConflict]   = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const hoje     = new Date(2026, 2, 18)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoje)
    d.setDate(hoje.getDate() - hoje.getDay() + i)
    return d
  })

  const filteredAppointments = filterDoctor
    ? appointments.filter((a) => a.doctorName === filterDoctor)
    : appointments

  const summary = [
    { label: "Confirmados", value: filteredAppointments.filter((a) => a.status === "confirmed").length, cls: styles.summaryGreen },
    { label: "Pendentes",   value: filteredAppointments.filter((a) => a.status === "pending").length,   cls: styles.summaryAmber },
    { label: "Ausentes",    value: filteredAppointments.filter((a) => a.status === "absent").length,    cls: styles.summaryRed   },
  ]

  // ── Conflict detection whenever key modal fields change ──────────
  useEffect(() => {
    if (!modal.doctorName || !modal.time || !modal.date) {
      setConflict(null)
      return
    }
    const result = checkConflict(
      appointments,
      modal.doctorName,
      modal.date,
      modal.time,
      Number(modal.duration) || 30,
    )
    setConflict(result ? result.message : null)
  }, [modal.doctorName, modal.date, modal.time, modal.duration, appointments])

  function setModalField(field: keyof ModalForm, value: string) {
    setModal((m) => ({ ...m, [field]: value }))
    setModalError(null)
  }

  function handleSaveAppointment() {
    if (!modal.patientName) { setModalError("Selecione o paciente"); return }
    if (!modal.doctorName)  { setModalError("Selecione o profissional"); return }
    if (!modal.time)        { setModalError("Selecione o horário"); return }
    if (!modal.type)        { setModalError("Selecione o tipo"); return }
    if (conflict)           { setModalError("Resolva o conflito de horário antes de salvar"); return }

    const newAppointment: Appointment = {
      id:           Date.now(),
      patientId:    patients.find((p) => p.name === modal.patientName)?.id ?? 0,
      patientName:  modal.patientName,
      doctorId:     DOCTORS.indexOf(modal.doctorName) + 1,
      doctorName:   modal.doctorName,
      date:         modal.date,
      time:         modal.time,
      duration:     Number(modal.duration) || 30,
      type:         modal.type as Appointment["type"],
      status:       "confirmed",
      preferredChannel: modal.channel as Appointment["preferredChannel"] | undefined,
      observations: modal.observations || undefined,
    }

    onAddAppointment(newAppointment)
    setModal(EMPTY_MODAL)
    setConflict(null)
    setShowModal(false)
  }

  const VIEW_LABELS: Record<CalendarView, string> = { day: "Dia", week: "Semana", month: "Mês" }

  return (
    <div>
      <Topbar
        title="Agendamento"
        subtitle="Agenda da clínica · 18 de março de 2026"
        action={
          <>
            <div className={styles.viewSwitcher}>
              {(["day", "week", "month"] as CalendarView[]).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`${styles.viewBtn} ${view === v ? styles.viewBtnActive : ""}`}>
                  {VIEW_LABELS[v]}
                </button>
              ))}
            </div>
            <Button onClick={() => setShowModal(true)} icon={<PlusIcon />}>Novo agendamento</Button>
          </>
        }
      />

      <div className={styles.layout}>
        <Card>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            <Select
              options={DOCTORS}
              placeholder="Todos os profissionais"
              value={filterDoctor}
              onChange={(e) => { setFilterDoctor(e.target.value); setSelected(null) }}
              className=""
            />
            <Select options={["Todas as unidades", "Unidade Central"]} className="" />
            <div className={styles.spacer} />
            <button className={styles.todayBtn}>Hoje</button>
          </div>

          {/* Day view */}
          {view === "day" && (
            <div className={styles.dayScroll}>
              {HOURS.map((h) => {
                const apt = filteredAppointments.find((a) => a.time === h)
                return (
                  <div key={h} className={styles.hourRow}>
                    <div className={styles.hourLabel}>{h}</div>
                    <div className={styles.hourCell}>
                      {apt ? (
                        <div
                          onClick={() => setSelected(apt)}
                          className={`${styles.appointmentBlock} ${BLOCK_STYLE[apt.status] ?? styles.appointmentBlockDefault}`}
                        >
                          <div className={styles.appointmentBlockRow}>
                            <p className={styles.appointmentPatient}>{apt.patientName}</p>
                            <Badge>{apt.status}</Badge>
                          </div>
                          <p className={styles.appointmentMeta}>
                            {formatAppointmentType(apt.type)} · {apt.doctorName} · {apt.duration}min
                          </p>
                        </div>
                      ) : (
                        <div className={styles.emptySlot} onClick={() => {
                          setModal((m) => ({ ...m, time: h }))
                          setShowModal(true)
                        }}>
                          <span className={styles.emptySlotLabel}>+ Disponível</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Week view */}
          {view === "week" && (
            <div className={styles.weekScroll}>
              <div className={styles.weekGrid}>
                <div style={{ backgroundColor: "var(--muted)", borderBottom: "1px solid var(--border)" }} />
                {weekDays.map((d) => (
                  <div key={d.toISOString()} className={styles.weekDayHeader}>
                    <p className={styles.weekDayName}>{DAYS_SHORT[d.getDay()]}</p>
                    <p className={`${styles.weekDayNum} ${d.getDate() === 18 ? styles.weekDayNumActive : ""}`}>
                      {d.getDate()}
                    </p>
                  </div>
                ))}
                {HOURS.slice(0, 8).map((h) => (
                  <>
                    <div key={h} className={styles.weekHourLabel}>{h}</div>
                    {weekDays.map((d) => {
                      const apt = d.getDate() === 18 ? filteredAppointments.find((a) => a.time === h) : null
                      return (
                        <div key={d.toISOString()} className={styles.weekCell}>
                          {apt && <div className={styles.weekEvent}>{apt.patientName.split(" ")[0]}</div>}
                        </div>
                      )
                    })}
                  </>
                ))}
              </div>
            </div>
          )}

          {/* Month view */}
          {view === "month" && (
            <div className={styles.monthPadding}>
              <div className={styles.monthGrid}>
                {DAYS_SHORT.map((d) => (
                  <div key={d} className={styles.monthDayLabel}>{d}</div>
                ))}
                {Array.from({ length: 31 }, (_, i) => {
                  const day      = i + 1
                  const isActive = day === 18
                  return (
                    <div key={day} className={`${styles.monthDayCell} ${isActive ? styles.monthDayCellActive : ""}`}>
                      <p className={`${styles.monthDayNum} ${isActive ? styles.monthDayNumActive : ""}`}>{day}</p>
                      {isActive && <div className={styles.monthDot} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Card>

        {/* Side panels */}
        <div className={styles.sidePanel}>
          {selected ? (
            <Card className={styles.detailCard}>
              <div className={styles.detailHeader}>
                <p className={styles.detailTitle}>Detalhes</p>
                <button className={styles.closeBtn} onClick={() => setSelected(null)}>×</button>
              </div>
              <Avatar name={selected.patientName} size="lg" />
              <p className={styles.detailPatientName}>{selected.patientName}</p>
              <div className={styles.detailBadge}><Badge>{selected.status}</Badge></div>
              <div className={styles.detailFields}>
                {([
                  ["Horário", selected.time],
                  ["Tipo",    formatAppointmentType(selected.type)],
                  ["Médico",  selected.doctorName],
                  ["Duração", `${selected.duration} min`],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className={styles.detailField}>
                    <span className={styles.detailFieldKey}>{k}</span>
                    <span className={styles.detailFieldVal}>{v}</span>
                  </div>
                ))}
              </div>
              <div className={styles.detailActions}>
                <Button size="sm" variant="outline">Editar</Button>
                <Button size="sm" variant="danger">Cancelar</Button>
              </div>
            </Card>
          ) : (
            <Card className={styles.summaryCard}>
              <p className={styles.summaryTitle}>Resumo do dia</p>
              {summary.map((s) => (
                <div key={s.label} className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>{s.label}</span>
                  <span className={`${styles.summaryValue} ${s.cls}`}>{s.value}</span>
                </div>
              ))}
            </Card>
          )}

          <Card className={styles.queueCard}>
            <p className={styles.queueTitle}>Fila de espera</p>
            <p className={styles.queueSub}>2 pacientes aguardando</p>
            {["Regina Paixão", "Hélio Santos"].map((n) => (
              <div key={n} className={styles.queueItem}>
                <Avatar name={n} size="sm" />
                <span className={styles.queueName}>{n}</span>
                <button className={styles.callBtn}>Chamar</button>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowModal(false); setModal(EMPTY_MODAL); setConflict(null); setModalError(null) }}>
          <Card className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Novo agendamento</h2>

            <div className={styles.modalGrid}>
              <input type="date" className={styles.dateInput}
                value={modal.date} onChange={(e) => setModalField("date", e.target.value)} />

              <select className={styles.dateInput}
                value={modal.time} onChange={(e) => setModalField("time", e.target.value)}>
                <option value="">Horário</option>
                {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>

              <div className={styles.colSpan2}>
                <Select
                  options={patients.map((p) => p.name)}
                  placeholder="Paciente"
                  value={modal.patientName}
                  onChange={(e) => setModalField("patientName", e.target.value)}
                />
              </div>

              <Select
                options={DOCTORS}
                placeholder="Profissional"
                value={modal.doctorName}
                onChange={(e) => setModalField("doctorName", e.target.value)}
              />

              <Select
                options={["Consulta", "Retorno", "Exame", "Procedimento"]}
                placeholder="Tipo"
                value={modal.type}
                onChange={(e) => setModalField("type", e.target.value)}
              />

              <Select
                options={["20 min", "30 min", "40 min", "60 min"]}
                placeholder="Duração"
                value={modal.duration ? `${modal.duration} min` : ""}
                onChange={(e) => setModalField("duration", e.target.value.replace(" min", ""))}
              />

              <Select
                options={["WhatsApp", "Email", "SMS"]}
                placeholder="Confirmação"
                value={modal.channel}
                onChange={(e) => setModalField("channel", e.target.value)}
              />
            </div>

            <textarea
              placeholder="Observações..."
              rows={2}
              value={modal.observations}
              onChange={(e) => setModalField("observations", e.target.value)}
              className={styles.modalTextarea}
            />

            {/* Conflict warning */}
            {conflict && (
              <div className={styles.conflictWarning}>
                <span style={{ fontSize: 16, lineHeight: 1.2 }}>⚠️</span>
                <p className={styles.conflictText}>{conflict}</p>
              </div>
            )}

            {/* Form error */}
            {modalError && !conflict && (
              <p style={{ marginTop: 10, fontSize: 12, color: "var(--destructive)" }}>{modalError}</p>
            )}

            <div className={styles.modalFooter}>
              <Button variant="ghost" onClick={() => { setShowModal(false); setModal(EMPTY_MODAL); setConflict(null); setModalError(null) }}>
                Cancelar
              </Button>
              <Button onClick={handleSaveAppointment} disabled={!!conflict}>
                Confirmar agendamento
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

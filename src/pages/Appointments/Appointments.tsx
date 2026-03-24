import { useState } from "react"
import { APPOINTMENTS, PATIENTS } from "../../data/mock"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Select } from "../../components/ui/Select/Select"
import { formatAppointmentType } from "../../utils"
import type { Appointment } from "../../types"
import styles from "./Appointments.module.css"

type CalendarView = "day" | "week" | "month"

const HOURS      = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","14:00","14:30","15:00","15:30","16:00","16:30","17:00"]
const DAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

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

export function Appointments() {
  const [view, setView]           = useState<CalendarView>("day")
  const [selected, setSelected]   = useState<Appointment | null>(null)
  const [showModal, setShowModal] = useState(false)

  const hoje    = new Date(2026, 2, 18)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoje)
    d.setDate(hoje.getDate() - hoje.getDay() + i)
    return d
  })

  const summary = [
    { label: "Confirmados", value: APPOINTMENTS.filter((a) => a.status === "confirmed").length, cls: styles.summaryGreen  },
    { label: "Pendentes",   value: APPOINTMENTS.filter((a) => a.status === "pending").length,   cls: styles.summaryAmber  },
    { label: "Ausentes",    value: APPOINTMENTS.filter((a) => a.status === "absent").length,    cls: styles.summaryRed    },
  ]

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
            <Select options={["Todos os profissionais", "Dr. Roberto Farias", "Dra. Carla Nunes"]} className="" />
            <Select options={["Todas as unidades", "Unidade Central"]} className="" />
            <div className={styles.spacer} />
            <button className={styles.todayBtn}>Hoje</button>
          </div>

          {/* Day view */}
          {view === "day" && (
            <div className={styles.dayScroll}>
              {HOURS.map((h) => {
                const apt = APPOINTMENTS.find((a) => a.time === h)
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
                        <div className={styles.emptySlot} onClick={() => setShowModal(true)}>
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
                      const apt = d.getDate() === 18 ? APPOINTMENTS.find((a) => a.time === h) : null
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
                  const day = i + 1
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
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <Card className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Novo agendamento</h2>
            <div className={styles.modalGrid}>
              <input type="date" className={styles.dateInput} />
              <input type="time" className={styles.dateInput} />
              <div className={styles.colSpan2}>
                <Select options={PATIENTS.map((p) => p.name)} placeholder="Paciente" />
              </div>
              <Select options={["Dr. Roberto Farias", "Dra. Carla Nunes"]} placeholder="Profissional" />
              <Select options={["Consulta", "Retorno", "Exame"]} placeholder="Tipo" />
              <Select options={["20 min", "30 min", "40 min", "60 min"]} placeholder="Duração" />
              <Select options={["WhatsApp", "Email", "SMS"]} placeholder="Confirmação" />
            </div>
            <textarea
              placeholder="Observações..."
              rows={2}
              className={styles.modalTextarea}
            />
            <div className={styles.modalFooter}>
              <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button onClick={() => setShowModal(false)}>Confirmar agendamento</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

import { useMemo } from "react"
import { Badge } from "../../components/ui/Badge/Badge"
import { Button } from "../../components/ui/Button/Button"
import {
  canPatientManageAppointment,
  getPatientDisplayStatus,
  showInPatientScheduledTab,
} from "../../utils/patientAppointments"
import { formatAppointmentType, formatDate } from "../../utils"
import type { Appointment } from "../../types"
import styles from "./PatientConsultationsView.module.css"

interface PatientConsultationsViewProps {
  appointments: Appointment[]
  loading?: boolean
  statusLabels: Record<string, string>
  onBack: () => void
  onBook?: () => void
  onReschedule: (appointment: Appointment) => void
  onCancel: (appointment: Appointment) => void
}

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function appointmentTs(appointment: Appointment): number {
  return new Date(`${appointment.date}T${appointment.time}:00`).getTime()
}

function AppointmentCard({
  appointment,
  onReschedule,
  onCancel,
  compact = false,
}: {
  appointment: Appointment
  onReschedule: (a: Appointment) => void
  onCancel: (a: Appointment) => void
  compact?: boolean
}) {
  const displayStatus = getPatientDisplayStatus(appointment)
  const manageable = canPatientManageAppointment(appointment)

  return (
    <article className={`${styles.apptCard} ${compact ? styles.apptCardCompact : ""}`}>
      <div className={styles.apptMain}>
        <div className={styles.apptTime}>
          <strong>{appointment.time}</strong>
          <span>{formatDate(appointment.date)}</span>
        </div>
        <div className={styles.apptInfo}>
          <p>{formatAppointmentType(appointment.type)}</p>
          <span>Dr(a). {appointment.doctorName}</span>
        </div>
        <Badge>{displayStatus}</Badge>
      </div>
      {manageable && (
        <div className={styles.apptActions}>
          <Button size="sm" variant="outline" onClick={() => onReschedule(appointment)}>
            Reagendar
          </Button>
          <Button size="sm" variant="danger" onClick={() => onCancel(appointment)}>
            Cancelar
          </Button>
        </div>
      )}
    </article>
  )
}

export function PatientConsultationsView({
  appointments,
  loading,
  statusLabels: _statusLabels, // mantido na API do componente (labels por status)
  onBack,
  onBook,
  onReschedule,
  onCancel,
}: PatientConsultationsViewProps) {
  const today = todayStr()

  const activeConsultations = useMemo(
    () => appointments.filter((a) =>
      (a.type === "consultation" || a.type === "return") && showInPatientScheduledTab(a)),
    [appointments],
  )

  const todayAppointments = useMemo(
    () => activeConsultations
      .filter((a) => a.date === today)
      .sort((a, b) => a.time.localeCompare(b.time)),
    [activeConsultations, today],
  )

  const upcomingAppointments = useMemo(
    () => activeConsultations
      .filter((a) => appointmentTs(a) > Date.now() && a.date !== today)
      .sort((a, b) => appointmentTs(a) - appointmentTs(b)),
    [activeConsultations],
  )

  const pastAbsent = useMemo(
    () => activeConsultations
      .filter((a) => getPatientDisplayStatus(a) === "absent")
      .sort((a, b) => appointmentTs(b) - appointmentTs(a)),
    [activeConsultations],
  )

  const groupedUpcoming = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const appt of upcomingAppointments) {
      const list = map.get(appt.date) ?? []
      list.push(appt)
      map.set(appt.date, list)
    }
    return [...map.entries()]
  }, [upcomingAppointments])

  return (
    <div className={styles.wrap}>
      <header className={styles.toolbar}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Voltar
        </button>
        <div>
          <h2>Consultas</h2>
          <p>Agenda do dia e próximos horários</p>
        </div>
        {onBook && (
          <Button onClick={onBook}>Nova consulta</Button>
        )}
      </header>

      <div className={styles.layout}>
        <section className={styles.todayPanel}>
          <div className={styles.panelHead}>
            <h3>Hoje</h3>
            <span>{formatDate(today)}</span>
          </div>
          {loading ? (
            <p className={styles.empty}>Carregando consultas...</p>
          ) : todayAppointments.length === 0 ? (
            <div className={styles.empty}>
              <strong>Nenhuma consulta hoje</strong>
              <span>Seus agendamentos do dia aparecerão aqui.</span>
            </div>
          ) : (
            <div className={styles.cardList}>
              {todayAppointments.map((appt) => (
                <AppointmentCard
                  key={appt.id}
                  appointment={appt}
                  onReschedule={onReschedule}
                  onCancel={onCancel}
                />
              ))}
            </div>
          )}
        </section>

        <aside className={styles.sideAgenda}>
          <div className={styles.panelHead}>
            <h3>Próximas</h3>
            <span>{upcomingAppointments.length}</span>
          </div>

          {loading ? (
            <p className={styles.empty}>Carregando...</p>
          ) : upcomingAppointments.length === 0 && pastAbsent.length === 0 ? (
            <div className={styles.empty}>
              <strong>Sem consultas futuras</strong>
              <span>Agende quando precisar.</span>
            </div>
          ) : (
            <div className={styles.agendaList}>
              {groupedUpcoming.map(([date, items]) => (
                <div key={date} className={styles.agendaGroup}>
                  <p className={styles.agendaDate}>{formatDate(date)}</p>
                  {items.map((appt) => (
                    <AppointmentCard
                      key={appt.id}
                      appointment={appt}
                      onReschedule={onReschedule}
                      onCancel={onCancel}
                      compact
                    />
                  ))}
                </div>
              ))}
              {pastAbsent.length > 0 && (
                <div className={styles.agendaGroup}>
                  <p className={styles.agendaDate}>Não compareceu</p>
                  {pastAbsent.map((appt) => (
                    <AppointmentCard
                      key={appt.id}
                      appointment={appt}
                      onReschedule={onReschedule}
                      onCancel={onCancel}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

import { Badge } from "../../components/ui/Badge/Badge"
import { Button } from "../../components/ui/Button/Button"
import type { Appointment, FinancialRecord, Prescription, Report } from "../../types"
import type { PortalSection } from "./patientPortalSections"
import { formatAppointmentType, formatDate, patientAppointmentStatusLabel } from "../../utils"
import { getPatientDisplayStatus } from "../../utils/patientAppointments"
import styles from "./PatientDashboard.module.css"

interface PatientDashboardProps {
  nextAppointment?: Appointment
  scheduledConsultations: Appointment[]
  cancelledConsultations: Appointment[]
  reports: Report[]
  prescriptions: Prescription[]
  pendingBilling: FinancialRecord[]
  appointmentsLoading: boolean
  onNavigate: (section: PortalSection) => void
}

export function PatientDashboard({
  nextAppointment,
  scheduledConsultations,
  cancelledConsultations,
  reports,
  prescriptions,
  pendingBilling,
  appointmentsLoading,
  onNavigate,
}: PatientDashboardProps) {
  const upcoming = scheduledConsultations
    .filter((a) => {
      const dt = new Date(`${a.date}T${a.time}:00`)
      return !Number.isNaN(dt.getTime()) && dt > new Date()
    })
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))

  const upcomingPreview = upcoming.slice(0, 4)

  const availableReports = reports.filter((r) => r.status === "Finalized" || r.status === "Sent")
  const recentReports = availableReports.slice(0, 3)

  return (
    <div className={styles.wrap}>
      <section className={styles.metrics}>
        <article className={styles.metricCard}>
          <span>Consultas ativas</span>
          <strong>{upcoming.length}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Canceladas</span>
          <strong>{cancelledConsultations.length}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Laudos</span>
          <strong>{availableReports.length}</strong>
        </article>
        <article className={styles.metricCard}>
          <span>Boletos pendentes</span>
          <strong>{pendingBilling.length}</strong>
        </article>
      </section>

      <div className={styles.grid}>
        <section className={styles.highlightCard}>
          <header>
            <h3>Próxima consulta</h3>
            <Button size="sm" variant="outline" onClick={() => onNavigate("find-doctor")}>Agendar</Button>
          </header>
          {appointmentsLoading ? (
            <p className={styles.muted}>Carregando agenda...</p>
          ) : nextAppointment ? (
            <div className={styles.nextAppt}>
              <strong>{formatDate(nextAppointment.date)} às {nextAppointment.time}</strong>
              <span>{formatAppointmentType(nextAppointment.type)} com Dr(a). {nextAppointment.doctorName}</span>
              <Badge>{patientAppointmentStatusLabel(getPatientDisplayStatus(nextAppointment))}</Badge>
            </div>
          ) : (
            <div className={styles.emptyInline}>
              <p>Você não tem consultas futuras.</p>
              <Button size="sm" onClick={() => onNavigate("find-doctor")}>Agendar agora</Button>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <header>
            <h3>Consultas agendadas</h3>
            <button type="button" onClick={() => onNavigate("consultations")}>Ver todas</button>
          </header>
          {upcoming.length === 0 ? (
            <p className={styles.muted}>Nenhuma consulta futura.</p>
          ) : (
            <ul className={styles.list}>
              {upcomingPreview.map((appt) => (
                <li key={appt.id}>
                  <strong>{formatDate(appt.date)} • {appt.time}</strong>
                  <span>Dr(a). {appt.doctorName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <header>
            <h3>Laudos recentes</h3>
            <button type="button" onClick={() => onNavigate("reports")}>Ver todos</button>
          </header>
          {recentReports.length === 0 ? (
            <p className={styles.muted}>Nenhum laudo disponível.</p>
          ) : (
            <ul className={styles.list}>
              {recentReports.map((report) => (
                <li key={report.id}>
                  <strong>{report.type?.trim() || report.exam?.trim() || "Laudo médico"}</strong>
                  <span>{formatDate(report.date)}</span>
                  <button type="button" className={styles.linkBtn} onClick={() => onNavigate("reports")}>
                    Ver laudos
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <header>
            <h3>Receitas</h3>
            <button type="button" onClick={() => onNavigate("prescriptions")}>Ver todas</button>
          </header>
          {prescriptions.length === 0 ? (
            <p className={styles.muted}>Nenhuma receita emitida.</p>
          ) : (
            <ul className={styles.list}>
              {prescriptions.slice(0, 3).map((rx) => (
                <li key={rx.id}>
                  <strong>{rx.medications.map((m) => m.name).join(", ") || "Receita médica"}</strong>
                  <span>{formatDate(rx.date)} • {rx.doctorName}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {pendingBilling.length > 0 && (
          <section className={`${styles.panel} ${styles.alertPanel}`}>
            <header>
              <h3>Pagamentos pendentes</h3>
              <button type="button" onClick={() => onNavigate("billing")}>Ver boletos</button>
            </header>
            <p>Você tem {pendingBilling.length} cobrança(s) aguardando pagamento.</p>
          </section>
        )}
      </div>
    </div>
  )
}

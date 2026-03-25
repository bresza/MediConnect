import { REPORTS } from "../../data/mock"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { formatDate, formatAppointmentType } from "../../utils"
import type { PageId, Patient, Appointment, User } from "../../types"
import styles from "./Dashboard.module.css"

interface DashboardProps {
  patients: Patient[]
  appointments: Appointment[]
  currentUser: User
  onNavigate: (page: PageId) => void
}

const PlusIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
    viewBox="0 0 24 24" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const STATS = [
  {
    label:    "Pacientes",
    icon:     "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
    valCls:   styles.statPrimary,
    iconBg:   styles.statIconPrimary,
    iconStroke: "var(--primary)",
  },
  {
    label:    "Agendamentos hoje",
    icon:     "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    valCls:   styles.statBlue,
    iconBg:   styles.statIconBlue,
    iconStroke: "#2563eb",
  },
  {
    label:    "Laudos pendentes",
    icon:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    valCls:   styles.statAmber,
    iconBg:   styles.statIconAmber,
    iconStroke: "#d97706",
  },
  {
    label:    "Taxa de presença",
    icon:     "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    valCls:   styles.statEmerald,
    iconBg:   styles.statIconEmerald,
    iconStroke: "#059669",
  },
]

export function Dashboard({ patients, appointments, currentUser, onNavigate }: DashboardProps) {
  const isDoctor = currentUser.role === "doctor"

  // Para médicos: mostrar apenas dados próprios
  const visibleAppointments = isDoctor
    ? appointments.filter((a) => a.doctorName === currentUser.name)
    : appointments

  // Pacientes que têm ao menos um agendamento com este médico
  const visiblePatientIds = isDoctor
    ? new Set(visibleAppointments.map((a) => a.patientId))
    : null
  const visiblePatients = isDoctor
    ? patients.filter((p) => visiblePatientIds!.has(p.id))
    : patients

  const pendingReports = isDoctor
    ? REPORTS.filter((r) => r.status === "Draft" && r.doctorName === currentUser.name)
    : REPORTS.filter((r) => r.status === "Draft")

  const confirmed = visibleAppointments.filter((a) => a.status === "confirmed").length
  const total     = visibleAppointments.filter((a) => a.status !== "blocked").length
  const rate      = total > 0 ? Math.round((confirmed / total) * 100) : 0

  const statValues: Record<string, string | number> = {
    "Pacientes":          visiblePatients.length,
    "Agendamentos hoje":  visibleAppointments.length,
    "Laudos pendentes":   pendingReports.length,
    "Taxa de presença":   `${rate}%`,
  }

  return (
    <div>
      <Topbar
        title="Dashboard"
        subtitle="Visão geral do sistema · 18 de março de 2026"
        action={
          <Button onClick={() => onNavigate("register")} icon={<PlusIcon />}>
            Novo paciente
          </Button>
        }
      />

      {/* Stats */}
      <div className={styles.statsGrid}>
        {STATS.map((s) => (
          <Card key={s.label} className={styles.statCard}>
            <div className={styles.statRow}>
              <div>
                <p className={styles.statLabel}>{s.label}</p>
                <p className={`${styles.statValue} ${s.valCls}`}>{statValues[s.label]}</p>
              </div>
              <div className={`${styles.statIconBox} ${s.iconBg}`}>
                <svg width="19" height="19" fill="none" stroke={s.iconStroke}
                  strokeWidth="1.75" viewBox="0 0 24 24">
                  {s.icon.split("M").filter(Boolean).map((d, i) => (
                    <path key={i} d={"M" + d} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                </svg>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Content columns */}
      <div className={styles.contentGrid}>

        {/* Today's appointments */}
        <Card>
          <div className={styles.cardHeader}>
            <p className={styles.cardHeaderTitle}>Agenda de hoje</p>
            <Button size="sm" variant="ghost" onClick={() => onNavigate("appointments")}>
              Ver tudo
            </Button>
          </div>
          {visibleAppointments.slice(0, 5).map((a) => (
            <div key={a.id} className={styles.appointmentRow}>
              <span className={styles.appointmentTime}>{a.time}</span>
              <Avatar name={a.patientName} size="sm" />
              <div className={styles.appointmentInfo}>
                <p className={styles.appointmentName}>{a.patientName}</p>
                <p className={styles.appointmentSub}>
                  {formatAppointmentType(a.type)} · {a.doctorName.split(" ").slice(0, 2).join(" ")}
                </p>
              </div>
              <Badge>{a.status}</Badge>
            </div>
          ))}
        </Card>

        {/* Recent patients */}
        <Card>
          <div className={styles.cardHeader}>
            <p className={styles.cardHeaderTitle}>Pacientes recentes</p>
            <Button size="sm" variant="ghost" onClick={() => onNavigate("patients")}>
              Ver todos
            </Button>
          </div>
          {visiblePatients.map((p) => (
            <div key={p.id} className={styles.patientRow}>
              <Avatar name={p.name} size="sm" />
              <div className={styles.patientInfo}>
                <p className={styles.patientName}>{p.name}</p>
                <p className={styles.patientSub}>
                  {p.healthInsurance} · última visita {p.lastVisit ? formatDate(p.lastVisit) : "—"}
                </p>
              </div>
              <Badge>{p.status}</Badge>
            </div>
          ))}
        </Card>

      </div>
    </div>
  )
}

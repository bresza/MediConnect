import { useState, useEffect } from "react"
import { getReports } from "../../services/domain"
import type { Report } from "../../types"
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

interface StatConfig {
  label: string
  icon: string
  valCls: string
  iconBg: string
  iconStroke: string
  trend: string
}

const STATS: StatConfig[] = [
  { label: "Pacientes",         icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z", valCls: styles.statPrimary,  iconBg: styles.statIconPrimary,  iconStroke: "var(--primary)", trend: "+3 mês" },
  { label: "Agendamentos hoje", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",         valCls: styles.statBlue,    iconBg: styles.statIconBlue,    iconStroke: "#0284c7",         trend: "hoje"  },
  { label: "Laudos pendentes",  icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", valCls: styles.statAmber,   iconBg: styles.statIconAmber,   iconStroke: "#d97706",         trend: "abertos" },
  { label: "Taxa de presença",  icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",                                                    valCls: styles.statEmerald, iconBg: styles.statIconEmerald, iconStroke: "#059669",         trend: "confirmados" },
]

function todayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function Dashboard({ patients, appointments, currentUser, onNavigate }: DashboardProps) {
  const isDoctor = currentUser.role === "doctor"
  const currentDoctorId = currentUser.doctorId ?? currentUser.id

  const [allReports, setAllReports] = useState<Report[]>([])
  useEffect(() => { getReports().then(setAllReports).catch(() => setAllReports([])) }, [])

  const isCurrentDoctor = (doctorId?: string, doctorName?: string) =>
    doctorId === currentDoctorId ||
    doctorId === currentUser.id ||
    doctorName === currentUser.name ||
    doctorName?.toLowerCase().trim() === currentUser.name.toLowerCase().trim()

  const visibleAppointments = isDoctor
    ? appointments.filter((a) => isCurrentDoctor(a.doctorId, a.doctorName))
    : appointments
  const todayAppointments = visibleAppointments
    .filter((a) => a.date === todayKey())
    .sort((a, b) => a.time.localeCompare(b.time))

  const visiblePatientIds = isDoctor
    ? new Set(visibleAppointments.map((a) => a.patientId))
    : null
  const visiblePatients = isDoctor
    ? patients.filter((p) => visiblePatientIds!.has(p.id))
    : patients

  const pendingReports = isDoctor
    ? allReports.filter((r) => r.status === "Draft" && isCurrentDoctor(r.doctorId, r.doctorName))
    : allReports.filter((r) => r.status === "Draft")

  const confirmed = visibleAppointments.filter((a) => a.status === "confirmed").length
  const total     = visibleAppointments.filter((a) => a.status !== "blocked").length
  const rate      = total > 0 ? Math.round((confirmed / total) * 100) : 0

  const statValues: Record<string, string | number> = {
    "Pacientes":          visiblePatients.length,
    "Agendamentos hoje":  todayAppointments.length,
    "Laudos pendentes":   pendingReports.length,
    "Taxa de presença":   `${rate}%`,
  }

  const today = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })

  return (
    <div>
      <Topbar
        title={currentUser.role === "doctor" ? "Meu Painel" : currentUser.role === "secretary" ? "Recepção" : "Dashboard"}
        subtitle={`Visão geral · ${today}`}
      />

      {/* Stats */}
      <div className={styles.statsGrid}>
        {STATS.map((s) => (
          <Card key={s.label} className={styles.statCard}>
            <div className={styles.statHeader}>
              <p className={styles.statLabel}>{s.label}</p>
              <div className={`${styles.statIconBox} ${s.iconBg}`}>
                <svg width="17" height="17" fill="none" stroke={s.iconStroke}
                  strokeWidth="1.8" viewBox="0 0 24 24">
                  {s.icon.split("M").filter(Boolean).map((d, i) => (
                    <path key={i} d={"M" + d} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                </svg>
              </div>
            </div>
            <p className={`${styles.statValue} ${s.valCls}`}>{statValues[s.label]}</p>
            <span className={styles.statTrend}>{s.trend}</span>
          </Card>
        ))}
      </div>

      {/* Content columns */}
      <div className={styles.contentGrid}>
        <Card>
          <div className={styles.cardHeader}>
            <p className={styles.cardHeaderTitle}>Agenda de hoje</p>
            <Button size="sm" variant="ghost" onClick={() => onNavigate("appointments")}>Ver tudo</Button>
          </div>
          {todayAppointments.length === 0 ? (
            <p className={styles.emptyRow}>Nenhum agendamento para hoje.</p>
          ) : todayAppointments.slice(0, 5).map((a) => (
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

        <Card>
          <div className={styles.cardHeader}>
            <p className={styles.cardHeaderTitle}>Pacientes recentes</p>
            <Button size="sm" variant="ghost" onClick={() => onNavigate("patients")}>Ver todos</Button>
          </div>
          {visiblePatients.length === 0 ? (
            <p className={styles.emptyRow}>Nenhum paciente encontrado.</p>
          ) : visiblePatients.slice(0, 5).map((p) => (
            <div key={p.id} className={styles.patientRow}>
              <Avatar name={p.name} size="sm" />
              <div className={styles.patientInfo}>
                <p className={styles.patientName}>{p.name}</p>
                <p className={styles.patientSub}>
                  {p.healthInsurance ?? "—"} · última visita {p.lastVisit ? formatDate(p.lastVisit) : "—"}
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

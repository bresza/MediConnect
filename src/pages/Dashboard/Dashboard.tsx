import { useCallback, useEffect, useMemo, useState } from "react"
import { getReports } from "../../services/domain"
import type { Report } from "../../types"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Badge } from "../../components/ui/Badge/Badge"
import { RefreshButton } from "../../components/ui/RefreshButton/RefreshButton"
import { formatDate, formatAppointmentType, sortByName, toTitleCase } from "../../utils"
import type { PageId, Patient, Appointment, User } from "../../types"
import styles from "./Dashboard.module.css"

interface DashboardProps {
  patients: Patient[]
  appointments: Appointment[]
  currentUser: User
  onNavigate: (page: PageId) => void
  onRefresh?: () => void | Promise<unknown>
}

interface StatConfig {
  label: string
  icon: string
  valCls: string
  iconBg: string
  iconStroke: string
}

const STATS: StatConfig[] = [
  {
    label: "Pacientes",
    icon: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
    valCls: styles.statPrimary,
    iconBg: styles.statIconPrimary,
    iconStroke: "var(--primary)",
  },
  {
    label: "Agendamentos hoje",
    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    valCls: styles.statBlue,
    iconBg: styles.statIconBlue,
    iconStroke: "#0284c7",
  },
  {
    label: "Laudos pendentes",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    valCls: styles.statAmber,
    iconBg: styles.statIconAmber,
    iconStroke: "#d97706",
  },
  {
    label: "Taxa de presença",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    valCls: styles.statEmerald,
    iconBg: styles.statIconEmerald,
    iconStroke: "#059669",
  },
]

const STAT_TRENDS: Record<string, string> = {
  "Pacientes":          "+3 mês",
  "Agendamentos hoje":  "hoje",
  "Laudos pendentes":   "abertos",
  "Taxa de presença":   "confirmados",
}

function todayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const PAGE_TITLES: Partial<Record<string, string>> = {
  doctor:    "Meu Painel",
  secretary: "Recepção",
  financial: "Dashboard",
  admin:     "Dashboard",
}

export function Dashboard({ patients, appointments, currentUser, onNavigate, onRefresh }: DashboardProps) {
  const isDoctor = currentUser.role === "doctor"

  const [allReports, setAllReports] = useState<Report[]>([])
  const loadReports = useCallback(() => {
    return getReports()
      .then(setAllReports)
      .catch(() => setAllReports([]))
  }, [])
  useEffect(() => { void loadReports() }, [loadReports])

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      onRefresh ? Promise.resolve(onRefresh()) : Promise.resolve(),
      loadReports(),
    ])
  }, [onRefresh, loadReports])

  const isCurrentDoctor = (doctorId?: string, doctorName?: string) =>
    doctorId === currentUser.id ||
    doctorName === currentUser.name ||
    doctorName?.toLowerCase().trim() === currentUser.name.toLowerCase().trim()

  const visibleAppointments = (isDoctor
    ? appointments.filter((a) => isCurrentDoctor(a.doctorId, a.doctorName))
    : appointments
  ).map((a) => ({
    ...a,
    patientName: toTitleCase(a.patientName),
    doctorName: toTitleCase(a.doctorName),
  }))

  const todayAppointments = visibleAppointments
    .filter((a) => a.date === todayKey())
    .sort((a, b) => a.time.localeCompare(b.time))

  const visiblePatients = sortByName(
    patients.map((p) => ({ ...p, name: toTitleCase(p.name) })),
    (p) => p.name,
  )

  const recentPatients = [...visiblePatients].sort((a, b) => {
    const dateCmp = (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "")
    if (dateCmp !== 0) return dateCmp
    return a.name.localeCompare(b.name, "pt-BR")
  })

  const pendingReports = isDoctor
    ? allReports.filter((r) => r.status === "Draft" && isCurrentDoctor(r.doctorId, r.doctorName))
    : allReports.filter((r) => r.status === "Draft")

  const confirmed = visibleAppointments.filter((a) => a.status === "confirmed").length
  const total     = visibleAppointments.filter((a) => a.status !== "blocked").length
  const rate      = total > 0 ? Math.round((confirmed / total) * 100) : 0

  const noShowAlerts = useMemo(() => {
    const history = new Map<string, { name: string; misses: number; total: number }>()
    for (const appointment of visibleAppointments) {
      if (appointment.status === "blocked") continue
      const key = appointment.patientId || appointment.patientName
      const entry = history.get(key) ?? { name: appointment.patientName, misses: 0, total: 0 }
      entry.total += 1
      if (appointment.status === "absent" || appointment.status === "cancelled") entry.misses += 1
      history.set(key, entry)
    }

    const riskyPatients = [...history.values()]
      .filter((entry) => entry.total >= 2 && entry.misses / entry.total >= 0.4)
      .sort((a, b) => (b.misses / b.total) - (a.misses / a.total))

    const todayRisk = todayAppointments
      .map((appointment) => {
        const key = appointment.patientId || appointment.patientName
        const entry = history.get(key)
        if (!entry || entry.total < 2 || entry.misses / entry.total < 0.4) return null
        return {
          patientName: appointment.patientName,
          time: appointment.time,
          riskPct: Math.round((entry.misses / entry.total) * 100),
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    return { riskyPatients, todayRisk }
  }, [visibleAppointments, todayAppointments])

  const statValues: Record<string, string | number> = {
    "Pacientes":          visiblePatients.length,
    "Agendamentos hoje":  todayAppointments.length,
    "Laudos pendentes":   pendingReports.length,
    "Taxa de presença":   `${rate}%`,
  }

  const today = new Date().toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric",
  })

  const pageTitle = PAGE_TITLES[currentUser.role] ?? "Dashboard"

  return (
    <div className={styles.page}>
      {/* Header — mesmo padrão visual do ManagerDashboard */}
      <header className={styles.header}>
        <div className={styles.headerInfo}>
          <h1 className={styles.headerTitle}>{pageTitle}</h1>
          <p className={styles.headerSubtitle}>Visão geral · {today}</p>
        </div>
        <div className={styles.headerActions}>
          <RefreshButton onRefresh={handleRefresh} variant="outline" size="md" />
        </div>
      </header>

      {(noShowAlerts.todayRisk.length > 0 || noShowAlerts.riskyPatients.length > 0) && (
        <section className={styles.alertBanner} role="status" aria-live="polite">
          <div className={styles.alertIcon} aria-hidden="true">!</div>
          <div className={styles.alertContent}>
            <p className={styles.alertTitle}>Alerta preditivo de no-show</p>
            {noShowAlerts.todayRisk.length > 0 ? (
              <p className={styles.alertText}>
                Pacientes com histórico de ausência/cancelamento na agenda de hoje:{" "}
                {noShowAlerts.todayRisk
                  .map((item) => `${item.patientName} (${item.time}, risco ${item.riskPct}%)`)
                  .join(" · ")}
              </p>
            ) : (
              <p className={styles.alertText}>
                {noShowAlerts.riskyPatients.length} paciente(s) com padrão recorrente de ausência ou cancelamento.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Stats — mesmo layout horizontal do ManagerDashboard */}
      <div className={styles.statsGrid}>
        {STATS.map((s) => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statLayout}>
              <div className={`${styles.statIconBox} ${s.iconBg}`}>
                <svg fill="none" stroke={s.iconStroke} strokeWidth="1.8" viewBox="0 0 24 24">
                  {s.icon.split("M").filter(Boolean).map((d, i) => (
                    <path key={i} d={"M" + d} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                </svg>
              </div>
              <div className={styles.statText}>
                <p className={styles.statLabel}>{s.label}</p>
                <p className={`${styles.statValue} ${s.valCls}`}>{statValues[s.label]}</p>
                <span className={styles.statTrend}>{STAT_TRENDS[s.label]}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Content — panels no mesmo padrão do ManagerDashboard */}
      <div className={styles.contentGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>Agenda de hoje</p>
            <button type="button" className={styles.linkBtn} onClick={() => onNavigate("appointments")}>
              Ver tudo
            </button>
          </div>
          <div className={styles.panelBody}>
            {todayAppointments.length === 0 ? (
              <p className={styles.emptyRow}>Nenhum agendamento para hoje.</p>
            ) : (
              todayAppointments.slice(0, 5).map((a) => (
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
              ))
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>Pacientes recentes</p>
            <button type="button" className={styles.linkBtn} onClick={() => onNavigate("patients")}>
              Ver todos
            </button>
          </div>
          <div className={styles.panelBody}>
            {visiblePatients.length === 0 ? (
              <p className={styles.emptyRow}>Nenhum paciente encontrado.</p>
            ) : (
              recentPatients.slice(0, 5).map((p) => (
                <div key={p.id} className={styles.patientRow}>
                  <Avatar name={p.name} size="sm" />
                  <div className={styles.patientInfo}>
                    <p className={styles.patientName}>{p.name}</p>
                    <p className={styles.patientSub}>
                      {p.healthInsurance ?? "—"} · última visita {p.lastVisit ? formatDate(p.lastVisit) : "—"}
                    </p>
                  </div>
                  <span className={styles.statusBadge}>{p.status === "Active" ? "Ativo" : p.status}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

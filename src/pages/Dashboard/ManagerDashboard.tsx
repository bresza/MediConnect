import { useCallback, useEffect, useMemo, useState } from "react"
import { getReports } from "../../services/domain"
import { getFinancialRecords } from "../../services/financial"
import type { PageId, Patient, Appointment, User, Report, FinancialRecord } from "../../types"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { RefreshButton } from "../../components/ui/RefreshButton/RefreshButton"
import { formatAppointmentType, sortByName, toTitleCase } from "../../utils"
import styles from "./ManagerDashboard.module.css"

interface ManagerDashboardProps {
  patients: Patient[]
  appointments: Appointment[]
  currentUser: User
  onNavigate: (page: PageId) => void
  onRefresh?: () => void | Promise<unknown>
  onOpenSidebar?: () => void
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function last7DaysKeys(): string[] {
  const keys: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    keys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    )
  }
  return keys
}

function formatDayLabel(key: string): string {
  const [, m, d] = key.split("-")
  return `${parseInt(d)} ${["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(m) - 1]}`
}

function getChartPoints(values: number[], width: number, height: number, padX: number, padY: number) {
  const max = Math.max(...values, 1)
  const step = (width - padX * 2) / Math.max(values.length - 1, 1)
  return values.map((v, i) => ({
    x: padX + i * step,
    y: height - padY - (v / max) * (height - padY * 2),
  }))
}

function buildLinePath(values: number[], width: number, height: number, padX: number, padY: number): string {
  const points = getChartPoints(values, width, height, padX, padY)
  if (points.length < 2) return points.map((p) => `M${p.x},${p.y}`).join(" ")
  return points.reduce((path, point, i) => {
    if (i === 0) return `M${point.x},${point.y}`
    const prev = points[i - 1]
    const midX = (prev.x + point.x) / 2
    return `${path} C${midX},${prev.y} ${midX},${point.y} ${point.x},${point.y}`
  }, "")
}

function ActivityIcon({ type }: { type: "user" | "doc" | "calendar" }) {
  if (type === "user") {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === "doc") {
    return (
      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FooterIcon({ type }: { type: "users" | "cancel" | "new" | "star" }) {
  if (type === "star") {
    return (
      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2 7.5 14 3 9.6l6.2-.9L12 3z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" strokeLinecap="round" strokeLinejoin="round" />
      {type !== "users" && <path d={type === "cancel" ? "M19 8l-6 6M13 8l6 6" : "M19 8v6M16 11h6"} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  consultation: "Consulta",
  exam:         "Exame",
  return:       "Retorno",
  procedure:    "Procedimento",
}

const DONUT_COLORS = ["#2d4a3e", "#5a7268", "#8fa897", "#c5cfc8", "#a3b5ac"]

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function isCurrentMonth(dateStr: string): boolean {
  const now = new Date()
  const d = new Date(dateStr + "T00:00:00")
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}

export function ManagerDashboard({ patients, appointments, onNavigate, onRefresh, onOpenSidebar }: ManagerDashboardProps) {
  const [allReports, setAllReports] = useState<Report[]>([])
  const [financialRecords, setFinancialRecords] = useState<FinancialRecord[]>([])

  const loadReports = useCallback(() => {
    return getReports()
      .then(setAllReports)
      .catch(() => setAllReports([]))
  }, [])

  const loadFinancial = useCallback(() => {
    return getFinancialRecords()
      .then(setFinancialRecords)
      .catch(() => setFinancialRecords([]))
  }, [])

  useEffect(() => { void loadReports(); void loadFinancial() }, [loadReports, loadFinancial])

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      onRefresh ? Promise.resolve(onRefresh()) : Promise.resolve(),
      loadReports(),
      loadFinancial(),
    ])
  }, [onRefresh, loadReports, loadFinancial])

  const today = todayKey()
  const dayKeys = useMemo(() => last7DaysKeys(), [])

  const todayAppointments = useMemo(
    () => appointments.filter((a) => a.date === today).sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, today],
  )

  const pendingReports = allReports.filter((r) => r.status === "Draft")

  const financialMonth = useMemo(() => {
    const thisMonth = financialRecords.filter((r) => isCurrentMonth(r.dueDate))
    const received = thisMonth.filter((r) => r.status === "Paid").reduce((s, r) => s + r.value, 0)
    const pending  = thisMonth.filter((r) => r.status === "Pending").reduce((s, r) => s + r.value, 0)
    const overdue  = thisMonth.filter((r) => r.status === "Overdue").reduce((s, r) => s + r.value, 0)
    return { received, pending, overdue }
  }, [financialRecords])

  const confirmed = appointments.filter((a) => a.status === "confirmed").length
  const totalNonBlocked = appointments.filter((a) => a.status !== "blocked").length
  const rate = totalNonBlocked > 0 ? Math.round((confirmed / totalNonBlocked) * 100) : 0

  const recentPatients = useMemo(
    () => sortByName(
      patients.map((p) => ({ ...p, name: toTitleCase(p.name) })),
      (p) => p.name,
    ).sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "")).slice(0, 5),
    [patients],
  )

  // Chart: completed and cancelled per day over last 7 days
  const completedSeries = useMemo(
    () => dayKeys.map((k) => appointments.filter((a) => a.date === k && a.status !== "cancelled" && a.status !== "blocked").length),
    [appointments, dayKeys],
  )
  const cancelledSeries = useMemo(
    () => dayKeys.map((k) => appointments.filter((a) => a.date === k && a.status === "cancelled").length),
    [appointments, dayKeys],
  )
  const chartLabels = dayKeys.map(formatDayLabel)

  const totalCompleted = completedSeries.reduce((s, v) => s + v, 0)
  const totalCancelled = cancelledSeries.reduce((s, v) => s + v, 0)
  const totalNew = patients.length

  // Donut: appointment type distribution
  const donutData = useMemo(() => {
    const counts: Record<string, number> = {}
    appointments.forEach((a) => {
      const label = APPOINTMENT_TYPE_LABELS[a.type] ?? toTitleCase(a.type)
      counts[label] = (counts[label] ?? 0) + 1
    })
    const total = appointments.length || 1
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count], i) => ({
        label,
        pct: Math.round((count / total) * 100),
        color: DONUT_COLORS[i % DONUT_COLORS.length],
      }))
  }, [appointments])

  const donutSlices = donutData.reduce<Array<typeof donutData[number] & { offset: number }>>(
    (acc, slice, i) => {
      const offset = i === 0 ? 0 : acc[i - 1].offset + acc[i - 1].pct / 100
      acc.push({ ...slice, offset })
      return acc
    },
    [],
  )

  // Activities: derive from recent appointments + finalized reports
  const activities = useMemo(() => {
    const items: Array<{ time: string; title: string; detail: string; icon: "user" | "doc" | "calendar"; tone: "green" | "orange" | "blue" }> = []

    const recentAppts = [...appointments]
      .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
      .slice(0, 2)

    recentAppts.forEach((a) => {
      items.push({
        time: a.time,
        title: `${formatAppointmentType(a.type)} agendado${a.status === "cancelled" ? " (cancelado)" : ""}:`,
        detail: toTitleCase(a.patientName),
        icon: "calendar",
        tone: a.status === "cancelled" ? "orange" : "blue",
      })
    })

    const recentReports = [...allReports]
      .filter((r) => r.status === "Finalized")
      .slice(0, 2)

    recentReports.forEach((r) => {
      items.push({
        time: r.date ?? "",
        title: "Laudo finalizado:",
        detail: r.type ?? "Laudo",
        icon: "doc",
        tone: "orange",
      })
    })

    const recentPats = [...patients]
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      .slice(0, 1)

    recentPats.forEach((p) => {
      items.push({
        time: p.createdAt?.slice(0, 10) ?? "",
        title: "Novo paciente cadastrado:",
        detail: toTitleCase(p.name),
        icon: "user",
        tone: "green",
      })
    })

    return items.slice(0, 4)
  }, [appointments, allReports, patients])

  const todayFormatted = new Date().toLocaleDateString("pt-BR", {
    day: "numeric", month: "long", year: "numeric",
  })

  const lineW = 360
  const lineH = 120
  const padX = 28
  const padY = 16
  const completedPoints = getChartPoints(completedSeries, lineW, lineH, padX, padY)
  const cancelledPoints = getChartPoints(cancelledSeries, lineW, lineH, padX, padY)
  const completedPath = buildLinePath(completedSeries, lineW, lineH, padX, padY)
  const areaPath = `${completedPath} L${lineW - padX},${lineH - padY} L${padX},${lineH - padY} Z`

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button type="button" className={styles.menuBtn} onClick={onOpenSidebar} aria-label="Abrir menu">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <div className={styles.headerInfo}>
            <h1 className={styles.headerTitle}>Dashboard</h1>
            <p className={styles.headerSubtitle}>Visão geral • {todayFormatted}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.notifBtn} aria-label="Notificações">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <RefreshButton onRefresh={handleRefresh} variant="outline" size="md" />
        </div>
      </header>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLayout}>
            <div className={`${styles.statIconBox} ${styles.iconPrimary}`}>
              <svg width="18" height="18" fill="none" stroke="#2d4a3e" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className={styles.statText}>
              <p className={styles.statLabel}>Pacientes</p>
              <p className={`${styles.statValue} ${styles.statPrimary}`}>{patients.length}</p>
              <span className={`${styles.statTrend} ${styles.statTrendUp}`}>↑ {patients.length} no mês</span>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statLayout}>
            <div className={`${styles.statIconBox} ${styles.iconBlue}`}>
              <svg width="18" height="18" fill="none" stroke="#0284c7" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className={styles.statText}>
              <p className={styles.statLabel}>Agendamentos hoje</p>
              <p className={`${styles.statValue} ${styles.statBlue}`}>{todayAppointments.length}</p>
              <span className={styles.statTrend}>— hoje</span>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statLayout}>
            <div className={`${styles.statIconBox} ${styles.iconAmber}`}>
              <svg width="18" height="18" fill="none" stroke="#d97706" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className={styles.statText}>
              <p className={styles.statLabel}>Laudos pendentes</p>
              <p className={`${styles.statValue} ${styles.statAmber}`}>{pendingReports.length}</p>
              <span className={`${styles.statTrend} ${pendingReports.length > 0 ? styles.statTrendUp : ""}`}>
                {pendingReports.length > 0 ? `▲ ${pendingReports.length} abertos` : "— nenhum"}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statLayout}>
            <div className={`${styles.statIconBox} ${styles.iconEmerald}`}>
              <svg width="18" height="18" fill="none" stroke="#059669" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className={styles.statText}>
              <p className={styles.statLabel}>Taxa de presença</p>
              <p className={`${styles.statValue} ${styles.statEmerald}`}>{rate}%</p>
              <span className={`${styles.statTrend} ${rate > 0 ? styles.statTrendUp : ""}`}>
                {rate > 0 ? `▲ ${rate}% confirmados` : "— sem dados"}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.statCard} style={{ cursor: "pointer" }} onClick={() => onNavigate("financial")}>
          <div className={styles.statLayout}>
            <div className={`${styles.statIconBox}`} style={{ background: "rgb(16 185 129 / 0.12)" }}>
              <svg width="18" height="18" fill="none" stroke="#10b981" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className={styles.statText}>
              <p className={styles.statLabel}>Receita do mês</p>
              <p className={styles.statValue} style={{ color: "#10b981" }}>{fmtBRL(financialMonth.received)}</p>
              <span className={styles.statTrend}>
                {financialMonth.pending > 0
                  ? `A receber: ${fmtBRL(financialMonth.pending)}`
                  : financialMonth.overdue > 0
                    ? `Vencido: ${fmtBRL(financialMonth.overdue)}`
                    : "— sem pendências"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.mainGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>Resumo de atendimentos</p>
            <span className={styles.periodSelect}>Últimos 7 dias</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.chartLegend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendLine} ${styles.legendLineSolid}`} />
                Consultas realizadas
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendLine} ${styles.legendLineDashed}`} />
                Consultas canceladas
              </span>
            </div>
            <div className={styles.chartWrap}>
              <svg className={styles.chartSvg} viewBox={`0 0 ${lineW} ${lineH + 24}`} preserveAspectRatio="xMidYMid meet">
                {[...Array(5)].map((_, i) => {
                  const max = Math.max(...completedSeries, 1)
                  const value = Math.round((max / 4) * (4 - i))
                  const y = padY + i * ((lineH - padY * 2) / 4)
                  return (
                    <g key={i}>
                      <text x="6" y={y + 3} fontSize="9" fill="#6b7280">{value}</text>
                      <line x1={padX} y1={y} x2={lineW - padX} y2={y} stroke="#e8ece9" strokeWidth="1" strokeDasharray="3 3" />
                    </g>
                  )
                })}
                <path d={areaPath} fill="url(#completedArea)" opacity="0.7" />
                <defs>
                  <linearGradient id="completedArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#5f826f" stopOpacity="0.2" />
                    <stop offset="1" stopColor="#5f826f" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={completedPath} fill="none" stroke="#2d4a3e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d={buildLinePath(cancelledSeries, lineW, lineH, padX, padY)} fill="none" stroke="#8fa897" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />
                {completedPoints.map((point, i) => (
                  <circle key={i} cx={point.x} cy={point.y} r="3" fill="#5f826f" stroke="#fff" strokeWidth="1.5" />
                ))}
                {cancelledPoints.map((point, i) => (
                  <circle key={i} cx={point.x} cy={point.y} r="2.6" fill="#9aa081" stroke="#fff" strokeWidth="1.2" />
                ))}
                {chartLabels.map((label, i) => {
                  const step = (lineW - padX * 2) / Math.max(chartLabels.length - 1, 1)
                  return (
                    <text key={label} x={padX + i * step} y={lineH + 18} textAnchor="middle" fontSize="9" fill="#6b7280">{label}</text>
                  )
                })}
              </svg>
            </div>
            <div className={styles.chartFooter}>
              <div className={styles.chartFooterItem}>
                <span className={`${styles.footerIcon} ${styles.footerIconGreen}`}><FooterIcon type="users" /></span>
                <div>
                  <p className={styles.chartFooterValue}>{totalCompleted}</p>
                  <p className={styles.chartFooterLabel}>Consultas realizadas</p>
                </div>
              </div>
              <div className={styles.chartFooterItem}>
                <span className={`${styles.footerIcon} ${styles.footerIconOlive}`}><FooterIcon type="cancel" /></span>
                <div>
                  <p className={styles.chartFooterValue}>{totalCancelled}</p>
                  <p className={styles.chartFooterLabel}>Consultas canceladas</p>
                </div>
              </div>
              <div className={styles.chartFooterItem}>
                <span className={`${styles.footerIcon} ${styles.footerIconBlue}`}><FooterIcon type="new" /></span>
                <div>
                  <p className={styles.chartFooterValue}>{totalNew}</p>
                  <p className={styles.chartFooterLabel}>Pacientes cadastrados</p>
                </div>
              </div>
              <div className={styles.chartFooterItem}>
                <span className={`${styles.footerIcon} ${styles.footerIconPurple}`}><FooterIcon type="star" /></span>
                <div>
                  <p className={styles.chartFooterValue}>{rate}%</p>
                  <p className={styles.chartFooterLabel}>Taxa de presença</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>Pacientes recentes</p>
            <button type="button" className={styles.linkBtn} onClick={() => onNavigate("patients")}>Ver todos</button>
          </div>
          <div className={styles.panelBody}>
            {recentPatients.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem 0" }}>Nenhum paciente encontrado.</p>
            ) : (
              recentPatients.map((p) => (
                <div key={p.id} className={styles.patientRow}>
                  <Avatar name={p.name} size="sm" />
                  <div className={styles.patientInfo}>
                    <p className={styles.patientName}>{p.name}</p>
                    <p className={styles.patientSub}>Última visita: {p.lastVisit ?? "—"}</p>
                  </div>
                  <span className={styles.statusBadge}>{p.status === "Active" ? "Ativo" : "Inativo"}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className={styles.bottomGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>Atividades recentes</p>
            <button type="button" className={styles.linkBtn} onClick={() => onNavigate("appointments")}>Ver todos</button>
          </div>
          <div className={styles.panelBody}>
            {activities.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem 0" }}>Nenhuma atividade recente.</p>
            ) : (
              activities.map((a, i) => (
                <div key={i} className={styles.activityRow}>
                  <span className={`${styles.activityIcon} ${styles[`activityIcon_${a.tone}`]}`}>
                    <ActivityIcon type={a.icon} />
                  </span>
                  <span className={styles.activityTime}>{a.time}</span>
                  <div className={styles.activityContent}>
                    <p className={styles.activityText}>
                      <strong>{a.title}</strong> {a.detail}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>Distribuição por tipo de atendimento</p>
          </div>
          <div className={styles.panelBody}>
            {donutData.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", padding: "1rem 0" }}>Sem agendamentos registrados.</p>
            ) : (
              <div className={styles.donutWrap}>
                <svg className={styles.donutSvg} viewBox="0 0 100 100">
                  {donutSlices.map((slice) => {
                    const circumference = 2 * Math.PI * 38
                    const dash = (slice.pct / 100) * circumference
                    const gap = circumference - dash
                    return (
                      <circle
                        key={slice.label}
                        cx="50" cy="50" r="38"
                        fill="none"
                        stroke={slice.color}
                        strokeWidth="14"
                        strokeDasharray={`${dash} ${gap}`}
                        strokeDashoffset={-slice.offset * circumference + circumference * 0.25}
                        transform="rotate(-90 50 50)"
                      />
                    )
                  })}
                </svg>
                <div className={styles.donutLegend}>
                  {donutData.map((slice) => (
                    <div key={slice.label} className={styles.donutLegendItem}>
                      <span className={styles.donutLegendLeft}>
                        <span className={styles.donutDot} style={{ background: slice.color }} />
                        {slice.label}
                      </span>
                      <span className={styles.donutPct}>{slice.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

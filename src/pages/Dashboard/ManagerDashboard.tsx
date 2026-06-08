import { useCallback } from "react"
import type { PageId } from "../../types"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { RefreshButton } from "../../components/ui/RefreshButton/RefreshButton"
import styles from "./ManagerDashboard.module.css"

interface ManagerDashboardProps {
  onNavigate: (page: PageId) => void
  onRefresh?: () => void | Promise<unknown>
  onOpenSidebar?: () => void
}

const MOCK_PATIENTS = [
  { name: "Bob Esponja", lastVisit: "05/06/2026" },
  { name: "Willian Silva", lastVisit: "05/06/2026" },
  { name: "Alicia Alexa", lastVisit: "04/06/2026" },
  { name: "Kenzo Marx", lastVisit: "04/06/2026" },
  { name: "Felipe Gabriel", lastVisit: "02/06/2026" },
]

const MOCK_ACTIVITIES = [
  {
    time: "09:15",
    title: "Novo paciente cadastrado:",
    detail: "Juliana Martins",
    icon: "user" as const,
    iconTone: "green" as const,
  },
  {
    time: "08:45",
    title: "Laudo finalizado:",
    detail: "Exame de Tomografia",
    icon: "doc" as const,
    iconTone: "orange" as const,
  },
  {
    time: "08:30",
    title: "Pagamento recebido:",
    detail: "R$ 350,00",
    icon: "money" as const,
    iconTone: "green" as const,
  },
]

const CHART_LABELS = ["1 Jun", "2 Jun", "3 Jun", "4 Jun", "5 Jun", "6 Jun", "7 Jun"]
const COMPLETED_SERIES = [7.5, 9.2, 15, 8.7, 12.6, 8.9, 5.4]
const CANCELLED_SERIES = [1.2, 2.4, 5.6, 1.4, 4.8, 1.7, 0.7]

const DONUT_SEGMENTS = [
  { label: "Clínico Geral", pct: 45, color: "#2d4a3e" },
  { label: "Cardiologia", pct: 25, color: "#5a7268" },
  { label: "Ortopedia", pct: 15, color: "#8fa897" },
  { label: "Outros", pct: 15, color: "#c5cfc8" },
]

function getChartPoints(values: number[], width: number, height: number, padX: number, padY: number) {
  const max = 20
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

function ActivityIcon({ type }: { type: "user" | "doc" | "money" }) {
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
      <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
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

export function ManagerDashboard({ onNavigate, onRefresh, onOpenSidebar }: ManagerDashboardProps) {
  const handleRefresh = useCallback(async () => {
    if (onRefresh) await Promise.resolve(onRefresh())
  }, [onRefresh])

  const lineW = 360
  const lineH = 120
  const padX = 28
  const padY = 16
  const completedPoints = getChartPoints(COMPLETED_SERIES, lineW, lineH, padX, padY)
  const cancelledPoints = getChartPoints(CANCELLED_SERIES, lineW, lineH, padX, padY)
  const completedPath = buildLinePath(COMPLETED_SERIES, lineW, lineH, padX, padY)
  const areaPath = `${completedPath} L${lineW - padX},${lineH - padY} L${padX},${lineH - padY} Z`

  const donutSlices = DONUT_SEGMENTS.reduce<Array<typeof DONUT_SEGMENTS[number] & { offset: number }>>(
    (acc, slice, i) => {
      const offset = i === 0 ? 0 : acc[i - 1].offset + acc[i - 1].pct / 100
      acc.push({ ...slice, offset })
      return acc
    },
    [],
  )

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
            <p className={styles.headerSubtitle}>Visão geral • 7 de junho de 2026</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input className={styles.searchInput} placeholder="Buscar paciente..." readOnly />
          </div>
          <button type="button" className={styles.notifBtn} aria-label="Notificações">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={styles.notifBadge}>3</span>
          </button>
          <RefreshButton onRefresh={handleRefresh} variant="outline" size="md" />
          <button type="button" className={styles.primaryBtn} onClick={() => onNavigate("register")}>
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Novo paciente
          </button>
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
              <p className={`${styles.statValue} ${styles.statPrimary}`}>33</p>
              <span className={`${styles.statTrend} ${styles.statTrendUp}`}>↑ 3 no mês</span>
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
              <p className={`${styles.statValue} ${styles.statBlue}`}>0</p>
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
              <p className={`${styles.statValue} ${styles.statAmber}`}>24</p>
              <span className={`${styles.statTrend} ${styles.statTrendUp}`}>▲ 24 abertos</span>
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
              <p className={`${styles.statValue} ${styles.statEmerald}`}>21%</p>
              <span className={`${styles.statTrend} ${styles.statTrendUp}`}>▲ 21% confirmados</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.mainGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>Resumo de atendimentos</p>
            <button type="button" className={styles.periodSelect}>
              Últimos 7 dias
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
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
                {[20, 15, 10, 5, 0].map((value, i) => {
                  const y = padY + i * ((lineH - padY * 2) / 4)
                  return (
                    <g key={value}>
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
                <path
                  d={completedPath}
                  fill="none" stroke="#2d4a3e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                />
                <path
                  d={buildLinePath(CANCELLED_SERIES, lineW, lineH, padX, padY)}
                  fill="none" stroke="#8fa897" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round"
                />
                {completedPoints.map((point) => (
                  <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="3" fill="#5f826f" stroke="#fff" strokeWidth="1.5" />
                ))}
                {cancelledPoints.map((point) => (
                  <circle key={`${point.x}-${point.y}-cancelled`} cx={point.x} cy={point.y} r="2.6" fill="#9aa081" stroke="#fff" strokeWidth="1.2" />
                ))}
                {CHART_LABELS.map((label, i) => {
                  const step = (lineW - padX * 2) / Math.max(CHART_LABELS.length - 1, 1)
                  return (
                    <text key={label} x={padX + i * step} y={lineH + 18} textAnchor="middle"
                      fontSize="9" fill="#6b7280">{label}</text>
                  )
                })}
              </svg>
            </div>
            <div className={styles.chartFooter}>
              <div className={styles.chartFooterItem}>
                <span className={`${styles.footerIcon} ${styles.footerIconGreen}`}><FooterIcon type="users" /></span>
                <div>
                  <p className={styles.chartFooterValue}>87</p>
                  <p className={styles.chartFooterLabel}>Consultas realizadas</p>
                  <p className={`${styles.chartFooterTrend} ${styles.statTrendUp}`}>↑ 12% vs. semana anterior</p>
                </div>
              </div>
              <div className={styles.chartFooterItem}>
                <span className={`${styles.footerIcon} ${styles.footerIconOlive}`}><FooterIcon type="cancel" /></span>
                <div>
                  <p className={styles.chartFooterValue}>9</p>
                  <p className={styles.chartFooterLabel}>Consultas canceladas</p>
                  <p className={`${styles.chartFooterTrend} ${styles.statTrendDown}`}>↓ 5% vs. semana anterior</p>
                </div>
              </div>
              <div className={styles.chartFooterItem}>
                <span className={`${styles.footerIcon} ${styles.footerIconBlue}`}><FooterIcon type="new" /></span>
                <div>
                  <p className={styles.chartFooterValue}>76</p>
                  <p className={styles.chartFooterLabel}>Novos pacientes</p>
                  <p className={`${styles.chartFooterTrend} ${styles.statTrendUp}`}>↑ 18% vs. semana anterior</p>
                </div>
              </div>
              <div className={styles.chartFooterItem}>
                <span className={`${styles.footerIcon} ${styles.footerIconPurple}`}><FooterIcon type="star" /></span>
                <div>
                  <p className={styles.chartFooterValue}>4.8</p>
                  <p className={styles.chartFooterLabel}>Avaliação média</p>
                  <p className={styles.stars}>★★★★<span className={styles.starHalf}>★</span></p>
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
            {MOCK_PATIENTS.map((p) => (
              <div key={p.name} className={styles.patientRow}>
                <Avatar name={p.name} size="sm" />
                <div className={styles.patientInfo}>
                  <p className={styles.patientName}>{p.name}</p>
                  <p className={styles.patientSub}>Última visita: {p.lastVisit}</p>
                </div>
                <span className={styles.statusBadge}>Ativo</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.bottomGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>Atividades recentes</p>
            <button type="button" className={styles.linkBtn}>Ver todos</button>
          </div>
          <div className={styles.panelBody}>
            {MOCK_ACTIVITIES.map((a) => (
              <div key={a.time} className={styles.activityRow}>
                <span className={`${styles.activityIcon} ${styles[`activityIcon_${a.iconTone}`]}`}>
                  <ActivityIcon type={a.icon} />
                </span>
                <span className={styles.activityTime}>{a.time}</span>
                <div className={styles.activityContent}>
                  <p className={styles.activityText}>
                    <strong>{a.title}</strong> {a.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>Distribuição por tipo de atendimento</p>
          </div>
          <div className={styles.panelBody}>
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
                {DONUT_SEGMENTS.map((slice) => (
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
          </div>
        </section>
      </div>

    </div>
  )
}

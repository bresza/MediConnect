import React, { useState, useMemo } from "react"
import { useFinancial } from "../../hooks/useFinancial"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Modal } from "../../components/ui/Modal/Modal"
import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog"
import { Input } from "../../components/ui/Input/Input"
import { Select } from "../../components/ui/Select/Select"
import { Section } from "../../components/ui/Section/Section"
import { formatDate, formatPaymentMethod } from "../../utils"
import type { FinancialRecord, PaymentMethod, PaymentStatus } from "../../types"
import styles from "./Financial.module.css"

// ─── helpers ──────────────────────────────────────────────────────
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
function todayStr() { return new Date().toISOString().slice(0, 10) }

// ─── types ────────────────────────────────────────────────────────
type FilterStatus = "all" | PaymentStatus
type PeriodKey    = "month" | "quarter" | "year" | "all"

interface RecordForm {
  patientName: string; value: string; discount: string
  paymentMethod: string; healthInsurance: string
  dueDate: string; status: string; observations: string
}

const EMPTY_FORM: RecordForm = {
  patientName: "", value: "", discount: "", paymentMethod: "Pix",
  healthInsurance: "", dueDate: todayStr(), status: "Pending", observations: "",
}

function recordToForm(r: FinancialRecord): RecordForm {
  return {
    patientName:     r.patientName,
    value:           String(r.value),
    discount:        r.discount ? String(r.discount) : "",
    paymentMethod:   r.paymentMethod,
    healthInsurance: r.healthInsurance ?? "",
    dueDate:         r.dueDate,
    status:          r.status,
    observations:    r.observations ?? "",
  }
}

const PAYMENT_METHODS: PaymentMethod[] = ["Pix", "Card", "Cash", "Insurance", "Transfer"]
const STATUSES: PaymentStatus[]        = ["Pending", "Paid", "Overdue", "Cancelled"]

const STATUS_LABELS: Record<string, string> = {
  all: "Todos", Pending: "Pendente", Paid: "Pago",
  Overdue: "Atrasado", Cancelled: "Cancelado",
}

const PERIOD_LABELS: Record<PeriodKey, string> = {
  month: "Este mês", quarter: "Trimestre", year: "Este ano", all: "Todos",
}

function filterByPeriod(records: FinancialRecord[], period: PeriodKey): FinancialRecord[] {
  if (period === "all") return records
  const now = new Date()
  return records.filter((r) => {
    const d = new Date(r.dueDate + "T00:00:00")
    if (period === "month")
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    if (period === "quarter") {
      const q = Math.floor(now.getMonth() / 3)
      return Math.floor(d.getMonth() / 3) === q && d.getFullYear() === now.getFullYear()
    }
    if (period === "year") return d.getFullYear() === now.getFullYear()
    return true
  })
}

// ─── CSV export ───────────────────────────────────────────────────
function exportCSV(records: FinancialRecord[]) {
  const header = ["Paciente", "Valor", "Desconto", "Método", "Convênio", "Vencimento", "Status"]
  const rows = records.map((r) => [
    r.patientName,
    r.value.toFixed(2),
    (r.discount ?? 0).toFixed(2),
    formatPaymentMethod(r.paymentMethod),
    r.healthInsurance ?? "",
    r.dueDate,
    STATUS_LABELS[r.status] ?? r.status,
  ])
  const csv = [header, ...rows].map((row) => row.join(";")).join("\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement("a"), { href: url, download: "financeiro.csv" })
  a.click()
  URL.revokeObjectURL(url)
}

// ─── bar chart ────────────────────────────────────────────────────
function BarChart({ records }: { records: FinancialRecord[] }) {
  const months = useMemo(() => {
    const map = new Map<string, { paid: number; pending: number; overdue: number }>()
    records.forEach((r) => {
      const key = r.dueDate.slice(0, 7)
      if (!map.has(key)) map.set(key, { paid: 0, pending: 0, overdue: 0 })
      const b = map.get(key)!
      if (r.status === "Paid")    b.paid    += r.value
      if (r.status === "Pending") b.pending += r.value
      if (r.status === "Overdue") b.overdue += r.value
    })
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, v]) => ({
        label: new Date(key + "-02").toLocaleDateString("pt-BR", { month: "short" }),
        ...v,
        total: v.paid + v.pending + v.overdue,
      }))
  }, [records])

  const maxVal = Math.max(...months.map((m) => m.total), 1)
  const ticks  = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxVal * t))

  if (months.length === 0) {
    return <p className={styles.chartEmpty}>Sem dados para exibir.</p>
  }

  return (
    <div className={styles.chartWrap}>
      <div className={styles.chartInner}>
        {/* Y axis */}
        <div className={styles.yAxis}>
          {[...ticks].reverse().map((t) => (
            <span key={t} className={styles.yTick}>
              {t >= 1000 ? `${(t / 1000).toFixed(0)}k` : t}
            </span>
          ))}
        </div>
        {/* Grid + bars */}
        <div className={styles.chartArea}>
          <div className={styles.gridLines}>
            {ticks.map((t) => <div key={t} className={styles.gridLine} />)}
          </div>
          <div className={styles.chartBars}>
            {months.map((m) => (
              <div key={m.label} className={styles.chartCol}>
                <div className={styles.barGroup}>
                  <div className={styles.barTooltip}>
                    <p><span className={styles.dotGreen} />Pago: {fmt(m.paid)}</p>
                    <p><span className={styles.dotAmber} />Pendente: {fmt(m.pending)}</p>
                    {m.overdue > 0 && <p><span className={styles.dotRed} />Atrasado: {fmt(m.overdue)}</p>}
                  </div>
                  <div className={styles.chartStack}>
                    {m.overdue > 0 && (
                      <div className={`${styles.bar} ${styles.barRed}`}
                        style={{ height: `${(m.overdue / maxVal) * 100}%` }} />
                    )}
                    {m.pending > 0 && (
                      <div className={`${styles.bar} ${styles.barAmber}`}
                        style={{ height: `${(m.pending / maxVal) * 100}%` }} />
                    )}
                    {m.paid > 0 && (
                      <div className={`${styles.bar} ${styles.barGreen}`}
                        style={{ height: `${(m.paid / maxVal) * 100}%` }} />
                    )}
                  </div>
                </div>
                <span className={styles.xLabel}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.legend}>
        <span><span className={`${styles.legendDot} ${styles.barGreen}`} />Recebido</span>
        <span><span className={`${styles.legendDot} ${styles.barAmber}`} />Pendente</span>
        <span><span className={`${styles.legendDot} ${styles.barRed}`}   />Atrasado</span>
      </div>
    </div>
  )
}

// ─── icons ────────────────────────────────────────────────────────
const PlusIcon     = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
const EditIcon     = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const TrashIcon    = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
const CheckIcon    = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round"><path d="M5 13l4 4L19 7"/></svg>
const DownloadIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
const ChevronIcon  = ({ open }: { open: boolean }) => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"
    viewBox="0 0 24 24" strokeLinecap="round"
    style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 150ms ease" }}>
    <path d="M6 9l6 6 6-6"/>
  </svg>
)

// ─── stat card ────────────────────────────────────────────────────
interface StatCardProps {
  label: string; value: string; sub: string
  iconPath: string; iconBg: string; iconColor: string
  valueCls: string; progress?: number
}

function StatCard({ label, value, sub, iconPath, iconBg, iconColor, valueCls, progress }: StatCardProps) {
  return (
    <Card className={styles.statCard}>
      <div className={styles.statTop}>
        <div>
          <p className={styles.statLabel}>{label}</p>
          <p className={`${styles.statValue} ${valueCls}`}>{value}</p>
        </div>
        <div className={styles.statIcon} style={{ background: iconBg }}>
          <svg width="18" height="18" fill="none" stroke={iconColor} strokeWidth="1.8"
            viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            {iconPath.split("M").filter(Boolean).map((d, i) => <path key={i} d={"M" + d} />)}
          </svg>
        </div>
      </div>
      <p className={styles.statSub}>{sub}</p>
      {progress !== undefined && (
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      )}
    </Card>
  )
}

// ─── main component ───────────────────────────────────────────────
export function Financial() {
  const {
    records,
    addRecord:    _addRecord,
    updateRecord: _updateRecord,
    deleteRecord: _deleteRecord,
  } = useFinancial()
  const [search, setSearch]             = useState("")
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all")
  const [period, setPeriod]             = useState<PeriodKey>("month")
  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<FinancialRecord | null>(null)
  const [confirmId, setConfirmId]       = useState<number | null>(null)
  const [form, setForm]                 = useState<RecordForm>(EMPTY_FORM)
  const [errors, setErrors]             = useState<Partial<Record<keyof RecordForm, string>>>({})
  const [expandedId, setExpandedId]     = useState<number | null>(null)

  // ── derived ─────────────────────────────────────────────────────
  const periodRecords = useMemo(() => filterByPeriod(records, period), [records, period])

  const summary = useMemo(() => {
    const total   = periodRecords.reduce((s, r) => s + r.value, 0)
    const paid    = periodRecords.filter((r) => r.status === "Paid").reduce((s, r) => s + r.value, 0)
    const pending = periodRecords.filter((r) => r.status === "Pending").reduce((s, r) => s + r.value, 0)
    const overdue = periodRecords.filter((r) => r.status === "Overdue").reduce((s, r) => s + r.value, 0)
    const rate    = total > 0 ? Math.round((paid / total) * 100) : 0
    return { total, paid, pending, overdue, rate }
  }, [periodRecords])

  const filtered = useMemo(() =>
    periodRecords.filter((r) =>
      (filterStatus === "all" || r.status === filterStatus) &&
      r.patientName.toLowerCase().includes(search.toLowerCase())
    ), [periodRecords, filterStatus, search])

  const confirmTarget = records.find((r) => r.id === confirmId)

  // ── form ────────────────────────────────────────────────────────
  function setField(f: keyof RecordForm, v: string) {
    setForm((p) => ({ ...p, [f]: v }))
    setErrors((e) => ({ ...e, [f]: undefined }))
  }

  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setErrors({}); setModalOpen(true) }
  function openEdit(r: FinancialRecord) { setEditing(r); setForm(recordToForm(r)); setErrors({}); setModalOpen(true) }

  function validate(): boolean {
    const e: Partial<Record<keyof RecordForm, string>> = {}
    if (!form.patientName.trim()) e.patientName = "Nome do paciente obrigatório"
    if (!form.value || isNaN(Number(form.value)) || Number(form.value) <= 0) e.value = "Valor inválido"
    if (!form.dueDate) e.dueDate = "Vencimento obrigatório"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSave() {
    if (!validate()) return
    const base: Omit<FinancialRecord, "id"> = {
      patientId:      editing?.patientId ?? 0,
      patientName:    form.patientName.trim(),
      appointmentId:  editing?.appointmentId,
      value:          Number(form.value),
      discount:       form.discount ? Number(form.discount) : undefined,
      paymentMethod:  form.paymentMethod as PaymentMethod,
      healthInsurance: form.healthInsurance.trim() || undefined,
      dueDate:        form.dueDate,
      status:         form.status as PaymentStatus,
      observations:   form.observations.trim() || undefined,
    }
    if (editing) {
      _updateRecord({ ...base, id: editing.id })
    } else {
      _addRecord(base)
    }
    setModalOpen(false)
  }

  function handleDelete(id: number) { _deleteRecord(id); setConfirmId(null) }
  function markAsPaid(id: number)   { const r = records.find(x => x.id === id); if (r) _updateRecord({ ...r, status: "Paid" }) }
  function toggleExpand(id: number) { setExpandedId((p) => (p === id ? null : id)) }

  // ── render ──────────────────────────────────────────────────────
  return (
    <div>
      <Topbar
        title="Financeiro"
        subtitle="Receitas e cobranças da clínica"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" icon={<DownloadIcon />} onClick={() => exportCSV(filtered)}>
              Exportar
            </Button>
            <Button icon={<PlusIcon />} onClick={openCreate}>Novo lançamento</Button>
          </div>
        }
      />

      {/* Period tabs */}
      <div className={styles.periodTabs}>
        {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`${styles.periodTab} ${period === p ? styles.periodTabActive : ""}`}>
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <StatCard
          label="Total previsto" value={fmt(summary.total)}
          sub={`${periodRecords.length} lançamentos`}
          iconPath="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          iconBg="rgb(124 144 130 / 0.12)" iconColor="var(--primary)"
          valueCls={styles.valDefault}
        />
        <StatCard
          label="Recebido" value={fmt(summary.paid)}
          sub={`Taxa de recebimento: ${summary.rate}%`}
          iconPath="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          iconBg="rgb(16 185 129 / 0.12)" iconColor="#10b981"
          valueCls={styles.valGreen}
          progress={summary.rate}
        />
        <StatCard
          label="A receber" value={fmt(summary.pending)}
          sub={`${periodRecords.filter((r) => r.status === "Pending").length} em aberto`}
          iconPath="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          iconBg="rgb(245 158 11 / 0.12)" iconColor="#f59e0b"
          valueCls={styles.valAmber}
        />
        <StatCard
          label="Em atraso" value={fmt(summary.overdue)}
          sub={`${periodRecords.filter((r) => r.status === "Overdue").length} vencidos`}
          iconPath="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          iconBg="rgb(239 68 68 / 0.10)" iconColor="#ef4444"
          valueCls={styles.valRed}
        />
      </div>

      {/* Chart */}
      <Card className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <p className={styles.chartTitle}>Receita mensal</p>
          <p className={styles.chartSub}>Últimos 6 meses</p>
        </div>
        <BarChart records={records} />
      </Card>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <svg className={styles.searchIcon} width="14" height="14" fill="none"
            stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
          </svg>
          <input className={styles.searchInput} value={search}
            onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por paciente..." />
        </div>
        {(["all", "Paid", "Pending", "Overdue", "Cancelled"] as FilterStatus[]).map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`${styles.filterBtn} ${filterStatus === s ? styles.filterBtnActive : ""}`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
        <span className={styles.filterCount}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <Card>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <svg width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5"
              viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p>Nenhum lançamento encontrado</p>
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}></th>
                  {["Paciente", "Valor líquido", "Método", "Convênio", "Vencimento", "Status", "Ações"].map((h) => (
                    <th key={h} className={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isLast    = i === filtered.length - 1
                  const isExpanded = expandedId === r.id
                  const net        = r.value - (r.discount ?? 0)
                  const tdCls      = `${styles.td} ${isLast && !isExpanded ? styles.tdLast : ""}`

                  return (
                    <React.Fragment key={r.id}>
                      <tr className={styles.tableRow}>
                        <td className={`${styles.td} ${styles.tdExpand}`}>
                          <button className={styles.expandBtn} onClick={() => toggleExpand(r.id)}>
                            <ChevronIcon open={isExpanded} />
                          </button>
                        </td>
                        <td className={tdCls}>
                          <div className={styles.patientCell}>
                            <Avatar name={r.patientName} size="sm" />
                            <div>
                              <p className={styles.patientName}>{r.patientName}</p>
                              {r.discount && (
                                <p className={styles.discountTag}>
                                  desc. {fmt(r.discount)}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={tdCls}>
                          <span className={styles.valueCell}>{fmt(net)}</span>
                          {r.discount ? (
                            <span className={styles.originalValue}>{fmt(r.value)}</span>
                          ) : null}
                        </td>
                        <td className={tdCls}>
                          <div className={styles.methodCell}>
                            <span className={`${styles.methodIcon} ${styles["method_" + r.paymentMethod]}`} />
                            {formatPaymentMethod(r.paymentMethod)}
                          </div>
                        </td>
                        <td className={tdCls}>{r.healthInsurance ?? "—"}</td>
                        <td className={tdCls}>
                          <span className={r.status === "Overdue" ? styles.overdueDate : ""}>
                            {formatDate(r.dueDate)}
                          </span>
                        </td>
                        <td className={tdCls}><Badge>{r.status}</Badge></td>
                        <td className={tdCls}>
                          <div className={styles.actions}>
                            {r.status !== "Paid" && r.status !== "Cancelled" && (
                              <button className={`${styles.actionBtn} ${styles.actionBtnGreen}`}
                                onClick={() => markAsPaid(r.id)} title="Marcar como pago">
                                <CheckIcon />
                              </button>
                            )}
                            <button className={styles.actionBtn} onClick={() => openEdit(r)} title="Editar">
                              <EditIcon />
                            </button>
                            <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                              onClick={() => setConfirmId(r.id)} title="Excluir">
                              <TrashIcon />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row */}
                      {isExpanded && (
                        <tr key={`${r.id}-exp`} className={styles.expandedRow}>
                          <td colSpan={8} className={`${styles.expandedCell} ${isLast ? styles.tdLast : ""}`}>
                            <div className={styles.expandedContent}>
                              <div className={styles.expandedGrid}>
                                <div>
                                  <p className={styles.expandedLabel}>Valor bruto</p>
                                  <p className={styles.expandedValue}>{fmt(r.value)}</p>
                                </div>
                                {r.discount && (
                                  <div>
                                    <p className={styles.expandedLabel}>Desconto</p>
                                    <p className={`${styles.expandedValue} ${styles.valRed}`}>-{fmt(r.discount)}</p>
                                  </div>
                                )}
                                <div>
                                  <p className={styles.expandedLabel}>Valor líquido</p>
                                  <p className={`${styles.expandedValue} ${styles.valGreen}`}>{fmt(net)}</p>
                                </div>
                                <div>
                                  <p className={styles.expandedLabel}>ID do agendamento</p>
                                  <p className={styles.expandedValue}>#{r.appointmentId ?? "—"}</p>
                                </div>
                              </div>
                              {r.observations && (
                                <div className={styles.expandedObs}>
                                  <p className={styles.expandedLabel}>Observações</p>
                                  <p className={styles.expandedObsText}>{r.observations}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal criar/editar */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar lançamento" : "Novo lançamento"}
        subtitle={editing ? `Editando: ${editing.patientName}` : "Preencha os dados do lançamento"}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editing ? "Salvar alterações" : "Criar lançamento"}</Button>
          </>
        }
      >
        <div className={styles.formGrid}>
          <Section title="Identificação">
            <div className={styles.grid2}>
              <Input label="Paciente" required className={styles.colSpan2}
                value={form.patientName} onChange={(e) => setField("patientName", e.target.value)}
                error={errors.patientName} placeholder="Nome do paciente" />
              <Input label="Valor (R$)" required type="number"
                value={form.value} onChange={(e) => setField("value", e.target.value)}
                error={errors.value} placeholder="0,00" />
              <Input label="Desconto (R$)" type="number"
                value={form.discount} onChange={(e) => setField("discount", e.target.value)}
                placeholder="0,00" />
            </div>
          </Section>

          <Section title="Pagamento">
            <div className={styles.grid2}>
              <Select label="Método de pagamento"
                value={form.paymentMethod} onChange={(e) => setField("paymentMethod", e.target.value)}
                options={PAYMENT_METHODS} />
              <Input label="Convênio"
                value={form.healthInsurance} onChange={(e) => setField("healthInsurance", e.target.value)}
                placeholder="Ex: Unimed" />
              <Input label="Vencimento" type="date" required
                value={form.dueDate} onChange={(e) => setField("dueDate", e.target.value)}
                error={errors.dueDate} />
              <Select label="Status"
                value={form.status} onChange={(e) => setField("status", e.target.value)}
                options={STATUSES} />
            </div>
          </Section>

          <Section title="Observações">
            <textarea
              className={styles.obsTextarea} rows={3}
              placeholder="Informações adicionais sobre este lançamento..."
              value={form.observations} onChange={(e) => setField("observations", e.target.value)}
            />
          </Section>
        </div>
      </Modal>

      {/* Confirm delete */}
      <ConfirmDialog
        isOpen={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId !== null && handleDelete(confirmId)}
        title="Excluir lançamento"
        message={`Tem certeza que deseja excluir o lançamento de ${confirmTarget?.patientName ?? "este paciente"}? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="danger"
      />
    </div>
  )
}

import { useMemo, useState } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog"
import { RefreshButton } from "../../components/ui/RefreshButton/RefreshButton"
import { formatCpfBR, formatDate, isRemovedPatientPlaceholder, onlyDigits, sortByName, toTitleCase } from "../../utils"
import { formatRecordStatus } from "../../utils/statusLabels"
import type { PageId, Patient } from "../../types"
import type { UseToastReturn } from "../../hooks/useToast"
import styles from "./Patients.module.css"

interface PatientsProps {
  patients: Patient[]
  onNavigate: (page: PageId) => void
  onEditPatient: (p: Patient) => void
  onViewProfile?: (p: Patient) => void
  onDeletePatient?: (id: string) => void | Promise<void>
  canCreatePatient?: boolean
  toast?: UseToastReturn["toast"]
  onRefresh?: () => void | Promise<unknown>
}

const SearchIcon = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
  </svg>
)
const PlusIcon = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const TrashIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
)

export function Patients({ patients, onNavigate, onEditPatient, onViewProfile, onDeletePatient, canCreatePatient = true, onRefresh }: PatientsProps) {
  const [search, setSearch]             = useState("")
  const [filterStatus, setFilterStatus] = useState<"All" | "Active" | "Inactive">("All")
  const [confirmId, setConfirmId]       = useState<string | null>(null)

  // Normaliza nome para exibicao e ordena alfabeticamente (case-insensitive, pt-BR).
  const orderedPatients = useMemo(() => {
    const normalized = patients
      .filter((p) => !isRemovedPatientPlaceholder(p))
      .map((p) => ({ ...p, name: toTitleCase(p.name) }))
    return sortByName(normalized, (p) => p.name)
  }, [patients])

  const filtered = orderedPatients.filter((p) => {
    if (filterStatus !== "All" && p.status !== filterStatus) return false
    const q = search.trim()
    if (!q) return true
    const qLower = q.toLowerCase()
    const qDigits = onlyDigits(q)
    if (p.name.toLowerCase().includes(qLower)) return true
    if (p.email?.toLowerCase().includes(qLower)) return true
    if (qDigits && onlyDigits(p.cpf).includes(qDigits)) return true
    return false
  })
  const confirmTarget = orderedPatients.find((p) => p.id === confirmId)
  const FILTER_LABELS = { All: "Todos", Active: "Ativo", Inactive: "Inativo" } as const

  function handleDeleteConfirm() {
    if (confirmId !== null) onDeletePatient?.(confirmId)
    setConfirmId(null)
  }

  const headerAction = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {onRefresh && <RefreshButton onRefresh={onRefresh} />}
      {canCreatePatient && (
        <Button onClick={() => onNavigate("register")} icon={<PlusIcon />}>Novo paciente</Button>
      )}
    </div>
  )

  return (
    <div>
      <Topbar
        title="Pacientes"
        subtitle={`${orderedPatients.length} pacientes cadastrados`}
        action={headerAction}
      />
      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou CPF..." className={styles.searchInput} />
        </div>
        {(["All", "Active", "Inactive"] as const).map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`${styles.filterBtn} ${filterStatus === s ? styles.filterBtnActive : ""}`}>
            {FILTER_LABELS[s]}
          </button>
        ))}
      </div>
      <Card>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
            <p>Nenhum paciente encontrado</p>
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>{["Paciente", "CPF", "Convênio", "Última visita", "Status", "Ações"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const isLast = i === filtered.length - 1
                  return (
                    <tr key={p.id} className={styles.clickableRow} onClick={() => onViewProfile?.(p)}>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                        <div className={styles.patientCell}>
                          {p.photoUrl ? <img src={p.photoUrl} alt={p.name} className={styles.patientPhoto} /> : <Avatar name={p.name} size="sm" />}
                          <div><p className={styles.patientName}>{p.name}</p><p className={styles.patientEmail}>{p.email}</p></div>
                        </div>
                      </td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{formatCpfBR(p.cpf) || "—"}</td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{p.healthInsurance ?? "—"}</td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{p.lastVisit ? formatDate(p.lastVisit) : "—"}</td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}><Badge>{formatRecordStatus(p.status)}</Badge></td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                        <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => onEditPatient(p)}>Editar</Button>
                          {onDeletePatient && (
                            <button className={styles.deleteBtn} onClick={() => setConfirmId(p.id)} title="Remover paciente"><TrashIcon /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ConfirmDialog
        isOpen={confirmId !== null} onClose={() => setConfirmId(null)} onConfirm={handleDeleteConfirm}
        title="Remover paciente" message={`Tem certeza que deseja remover ${confirmTarget?.name ?? "este paciente"}? Todos os dados vinculados serão perdidos.`}
        confirmLabel="Remover" variant="danger"
      />
    </div>
  )
}

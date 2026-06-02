import { useMemo, useState } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { InlineErrorRetry } from "../../components/ui/InlineErrorRetry/InlineErrorRetry"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { Card } from "../../components/ui/Card/Card"
import { Button } from "../../components/ui/Button/Button"
import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog"
import { RefreshButton } from "../../components/ui/RefreshButton/RefreshButton"
import { onlyDigits, sortByName, toTitleCase } from "../../utils"
import type { PageId, Patient } from "../../types"
import type { UseToastReturn } from "../../hooks/useToast"
import { PatientsVirtualTable } from "./PatientsVirtualTable"
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
  loadError?: string | null
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
export function Patients({
  patients,
  onNavigate,
  onEditPatient,
  onViewProfile,
  onDeletePatient,
  canCreatePatient = true,
  onRefresh,
  loadError,
}: PatientsProps) {
  const [search, setSearch]             = useState("")
  const debouncedSearch                 = useDebouncedValue(search, 300)
  const [filterStatus, setFilterStatus] = useState<"All" | "Active" | "Inactive">("All")
  const [confirmId, setConfirmId]       = useState<string | null>(null)

  // Normaliza nome para exibicao e ordena alfabeticamente (case-insensitive, pt-BR).
  const orderedPatients = useMemo(() => {
    const normalized = patients.map((p) => ({ ...p, name: toTitleCase(p.name) }))
    return sortByName(normalized, (p) => p.name)
  }, [patients])

  const filtered = useMemo(() => orderedPatients.filter((p) => {
    if (filterStatus !== "All" && p.status !== filterStatus) return false
    const q = debouncedSearch.trim()
    if (!q) return true
    const qLower = q.toLowerCase()
    const qDigits = onlyDigits(q)
    if (p.name.toLowerCase().includes(qLower)) return true
    if (p.email?.toLowerCase().includes(qLower)) return true
    if (qDigits && onlyDigits(p.cpf).includes(qDigits)) return true
    return false
  }), [orderedPatients, filterStatus, debouncedSearch])

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
        subtitle={`${patients.length} pacientes cadastrados`}
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
      {loadError && onRefresh && (
        <InlineErrorRetry message={loadError} onRetry={() => void onRefresh()} />
      )}
      <Card>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" />
            </svg>
            <p>Nenhum paciente encontrado</p>
          </div>
        ) : (
          <PatientsVirtualTable
            patients={filtered}
            onViewProfile={onViewProfile}
            onEditPatient={onEditPatient}
            onRequestDelete={onDeletePatient ? setConfirmId : undefined}
          />
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

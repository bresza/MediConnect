import { useMemo, useState } from "react"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog"
import { Modal } from "../../components/ui/Modal/Modal"
import { Input } from "../../components/ui/Input/Input"
import { Button } from "../../components/ui/Button/Button"
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
  onResetPassword?: (p: Patient, password: string) => Promise<Patient>
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
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const RefreshIcon = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.9" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 11-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
)
const TrashIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
)
const KeyIcon = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
)

export function Patients({ patients, onNavigate, onEditPatient, onViewProfile, onDeletePatient, onResetPassword, canCreatePatient = true, toast, onRefresh }: PatientsProps) {
  const [search, setSearch]             = useState("")
  const [filterStatus, setFilterStatus] = useState<"All" | "Active" | "Inactive">("All")
  const [confirmId, setConfirmId]       = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Modal de redefinição de senha do portal
  const [resetTarget, setResetTarget]   = useState<Patient | null>(null)
  const [resetPwd, setResetPwd]         = useState("")
  const [resetConfirm, setResetConfirm] = useState("")
  const [resetError, setResetError]     = useState<string | null>(null)
  const [resetSaving, setResetSaving]   = useState(false)
  const [resetDone, setResetDone]       = useState<string | null>(null)

  function openReset(p: Patient) {
    setResetTarget(p); setResetPwd(""); setResetConfirm("")
    setResetError(null); setResetDone(null); setResetSaving(false)
  }
  function closeReset() {
    setResetTarget(null); setResetPwd(""); setResetConfirm("")
    setResetError(null); setResetDone(null); setResetSaving(false)
  }
  async function submitReset() {
    if (!resetTarget || !onResetPassword) return
    if (resetPwd.length < 6) { setResetError("A senha deve ter pelo menos 6 caracteres."); return }
    if (resetPwd !== resetConfirm) { setResetError("As senhas não coincidem."); return }
    setResetSaving(true); setResetError(null)
    try {
      await onResetPassword(resetTarget, resetPwd)
      setResetDone(resetPwd)
      toast?.(`Senha definida para ${toTitleCase(resetTarget.name)}.`, "success")
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Não foi possível definir a senha.")
    } finally {
      setResetSaving(false)
    }
  }

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

  async function handleRefresh() {
    if (!onRefresh || isRefreshing) return
    setIsRefreshing(true)
    try {
      await Promise.resolve(onRefresh())
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Pacientes</h1>
          <p className={styles.subtitle}>{orderedPatients.length} pacientes cadastrados</p>
        </div>
        <div className={styles.headerActions}>
          {onRefresh && (
            <button type="button" className={styles.refreshBtn} onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshIcon />
              Atualizar
            </button>
          )}
          {canCreatePatient && (
            <button type="button" className={styles.newBtn} onClick={() => onNavigate("register")}>
              <PlusIcon />
              Novo paciente
            </button>
          )}
        </div>
      </header>

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

      <section className={styles.tablePanel}>
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
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                        <span className={styles.statusBadge}>{formatRecordStatus(p.status)}</span>
                      </td>
                      <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                        <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                          <button type="button" className={styles.editBtn} onClick={() => onEditPatient(p)}>Editar</button>
                          {onResetPassword && (
                            <button type="button" className={styles.deleteBtn} onClick={() => openReset(p)} title="Redefinir senha de acesso"><KeyIcon /></button>
                          )}
                          {onDeletePatient && (
                            <button type="button" className={styles.deleteBtn} onClick={() => setConfirmId(p.id)} title="Remover paciente"><TrashIcon /></button>
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
      </section>

      <ConfirmDialog
        isOpen={confirmId !== null} onClose={() => setConfirmId(null)} onConfirm={handleDeleteConfirm}
        title="Remover paciente" message={`Tem certeza que deseja remover ${confirmTarget?.name ?? "este paciente"}? Todos os dados vinculados serão perdidos.`}
        confirmLabel="Remover" variant="danger"
      />

      <Modal
        isOpen={resetTarget !== null}
        onClose={closeReset}
        title="Redefinir senha de acesso"
        subtitle={resetTarget ? toTitleCase(resetTarget.name) : undefined}
        size="sm"
        footer={
          resetDone ? (
            <Button onClick={closeReset}>Concluir</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={closeReset}>Cancelar</Button>
              <Button onClick={submitReset} disabled={resetSaving}>
                {resetSaving ? "Definindo..." : "Definir senha"}
              </Button>
            </>
          )
        }
      >
        {resetDone ? (
          <div>
            <p style={{ fontSize:13, color:"var(--foreground)", marginBottom:10 }}>
              Senha definida com sucesso. A lista de pacientes foi atualizada. Repasse estas credenciais ao paciente:
            </p>
            <div style={{ fontSize:13, color:"var(--foreground)", lineHeight:1.7 }}>
              E-mail: <strong>{resetTarget?.email || "—"}</strong><br />
              Senha: <code style={{ fontSize:14, fontWeight:700, background:"var(--muted)", padding:"2px 8px", borderRadius:4, border:"1px solid var(--border)" }}>{resetDone}</code>
            </div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <p style={{ fontSize:13, color:"var(--muted-foreground)" }}>
              Defina uma nova senha de acesso ao portal para <strong>{resetTarget?.email || "este paciente"}</strong>.
              A senha passa a valer imediatamente.
            </p>
            <p style={{ fontSize:12, color:"var(--muted-foreground)", padding:"10px 12px", borderRadius:8, background:"var(--muted)", border:"1px solid var(--border)" }}>
              Atenção: a redefinição recria o cadastro do paciente. Consultas e laudos vinculados ao ID anterior não são transferidos automaticamente. A lista será atualizada após concluir.
            </p>
            <Input
              label="Nova senha"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={resetPwd}
              onChange={(e) => { setResetPwd(e.target.value); setResetError(null) }}
            />
            <Input
              label="Confirmar nova senha"
              type="password"
              value={resetConfirm}
              onChange={(e) => { setResetConfirm(e.target.value); setResetError(null) }}
              error={resetError ?? undefined}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}

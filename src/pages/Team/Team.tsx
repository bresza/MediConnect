import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Button } from "../../components/ui/Button/Button"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Modal } from "../../components/ui/Modal/Modal"
import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog"
import { Input } from "../../components/ui/Input/Input"
import { Select } from "../../components/ui/Select/Select"
import { Section } from "../../components/ui/Section/Section"
import { RefreshButton } from "../../components/ui/RefreshButton/RefreshButton"
import {
  crmDigits, crmUf as parseCrmUf,
  formatCpfBR, formatCrm, formatPhoneBR, onlyDigits,
  hasAtLeastTwoNames, isValidCpf, isValidEmail,
  sortByName, toTitleCase,
} from "../../utils"
import type { Gender, StaffMember, StaffRole, StaffStatus } from "../../types"
import type { UseToastReturn } from "../../hooks/useToast"
import type { UseStaffReturn } from "../../hooks/useStaff"
import { getRoleLabel } from "../../utils/permissions"
import { formatRecordStatus, RECORD_STATUS_OPTIONS } from "../../utils/statusLabels"
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition"
import { isAIConfigured } from "../../services/ai"
import {
  getStaffVoiceSteps,
  normalizeStaffVoiceField,
  parseStaffVoiceLocal,
  parseStaffVoiceWithAI,
  type StaffVoiceFieldKey,
  type StaffVoiceParseResult,
} from "../../services/staffVoiceFill"
import styles from "./Team.module.css"

type TabId = StaffRole

interface TeamProps {
  staff:    UseStaffReturn["staff"]
  isLoading?: boolean
  onAdd:    UseStaffReturn["addStaff"]
  onUpdate: UseStaffReturn["updateStaff"]
  onDelete: UseStaffReturn["deleteStaff"]
  toast:    UseToastReturn["toast"]
  onRefresh?: () => void | Promise<unknown>
}

interface StaffForm {
  name:            string
  email:           string
  phone:           string
  gender:          "" | Gender
  status:          StaffStatus
  cpf:             string   // todos os perfis
  crmNum:          string   // médico
  crmUf:           string   // médico
  specialty:       string   // médico
  department:      string   // secretária/gestor
  password:        string
  confirmPassword: string
}

const EMPTY_FORM: StaffForm = {
  name: "", email: "", phone: "", gender: "", status: "Active",
  cpf: "", crmNum: "", crmUf: "", specialty: "", department: "",
  password: "", confirmPassword: "",
}

const GENDER_OPTIONS = [
  { value: "Male", label: "Masculino" },
  { value: "Female", label: "Feminino" },
  { value: "Other", label: "Outro / não informar" },
]

function memberToForm(m: StaffMember): StaffForm {
  return {
    name: m.name,
    email: m.email,
    phone: formatPhoneBR(m.phone ?? ""),
    gender: m.gender ?? "",
    status: m.status,
    cpf: formatCpfBR(m.cpf ?? ""),
    crmNum: crmDigits(m.crm),
    crmUf: parseCrmUf(m.crm),
    specialty: m.specialty ?? "",
    department: m.department ?? "",
    password: "",
    confirmPassword: "",
  }
}

function displayMaskedCpf(value?: string): string {
  return formatCpfBR(value) || "—"
}

function displayMaskedPhone(value?: string): string {
  return formatPhoneBR(value) || "—"
}

function displayCrm(value?: string): string {
  return formatCrm(value) || "—"
}

const SPECIALTIES = [
  "Clínica Geral","Cardiologia","Dermatologia","Ginecologia",
  "Neurologia","Ortopedia","Pediatria","Psiquiatria",
  "Oftalmologia","Urologia","Endocrinologia","Oncologia",
]

const UF_LIST = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
]

// ─── Icons ────────────────────────────────────────────────────────
const PlusIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
const EditIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
const TrashIcon = () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>

const EyeIcon = ({ open }: { open: boolean }) => open
  ? <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><path d="M1 1l22 22" /></svg>
  : <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>

// ─── Tabs ─────────────────────────────────────────────────────────
const TABS: { id: TabId; label: string; singular: string }[] = [
  { id: "doctor",    label: "Médicos",     singular: "médico"     },
  { id: "secretary", label: "Secretárias", singular: "secretária" },
  { id: "manager",   label: "Gestores",    singular: "gestor"     },
]

// ─── Password input helper ────────────────────────────────────────
function PasswordInput({ label, value, show, onToggle, onChange, error, placeholder = "Mínimo 6 caracteres" }: {
  label: string; value: string; show: boolean; onToggle: () => void
  onChange: (v: string) => void; error?: string; placeholder?: string
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>
        {label} <span style={{ color: "var(--destructive)" }}>*</span>
      </label>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"} value={value} placeholder={placeholder}
          autoComplete="new-password"
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", padding: "8px 36px 8px 12px", borderRadius: 8, fontSize: 13,
            border: `1px solid ${error ? "var(--destructive)" : "var(--border)"}`,
            background: "var(--background)", color: "var(--foreground)",
            outline: "none", boxSizing: "border-box",
          }}
        />
        <button type="button" onClick={onToggle} style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 0, display: "flex",
        }}>
          <EyeIcon open={show} />
        </button>
      </div>
      {error && <span style={{ fontSize: 11, color: "var(--destructive)" }}>{error}</span>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────
export function Team({ staff, isLoading = false, onAdd, onUpdate, onDelete, toast, onRefresh }: TeamProps) {
  const [activeTab,     setActiveTab]     = useState<TabId>("doctor")
  const [search,        setSearch]        = useState("")
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null)
  const [confirmId,     setConfirmId]     = useState<string | null>(null)
  const [form,          setForm]          = useState<StaffForm>(EMPTY_FORM)
  const [errors,        setErrors]        = useState<Partial<Record<keyof StaffForm, string>>>({})
  const [isSaving,      setIsSaving]      = useState(false)
  const [showPass,      setShowPass]      = useState(false)
  const [showConfirm,   setShowConfirm]   = useState(false)
  const [voiceGuided,   setVoiceGuided]   = useState(false)
  const [voiceStepIndex, setVoiceStepIndex] = useState(0)
  const [voicePreview,  setVoicePreview]  = useState("")
  const [isVoiceApplying, setIsVoiceApplying] = useState(false)
  const voiceLinesRef = useRef<{ field: StaffVoiceFieldKey; spoken: string }[]>([])
  const voiceStepIndexRef = useRef(0)
  const saveLockRef = useRef(false)

  const handleChange = useCallback((field: keyof StaffForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }, [])

  const voiceSteps = useMemo(() => getStaffVoiceSteps(activeTab), [activeTab])
  voiceStepIndexRef.current = voiceStepIndex
  const currentVoiceStep = voiceGuided ? voiceSteps[voiceStepIndex] : null
  const aiAvailable = useMemo(() => isAIConfigured(), [])

  const applyParsedToForm = useCallback((parsed: StaffVoiceParseResult) => {
    if (parsed.name) handleChange("name", parsed.name)
    if (parsed.email) handleChange("email", parsed.email)
    if (parsed.phone) handleChange("phone", formatPhoneBR(parsed.phone))
    if (parsed.gender) handleChange("gender", parsed.gender)
    if (parsed.cpf) handleChange("cpf", formatCpfBR(parsed.cpf))
    if (parsed.crmNum) handleChange("crmNum", onlyDigits(parsed.crmNum).slice(0, 7))
    if (parsed.crmUf) handleChange("crmUf", parsed.crmUf.toUpperCase())
    if (parsed.specialty) handleChange("specialty", parsed.specialty)
    if (parsed.department) handleChange("department", parsed.department)
    if (parsed.password) {
      handleChange("password", parsed.password)
      handleChange("confirmPassword", parsed.password)
    }
  }, [handleChange])

  const startVoiceRef = useRef<() => void>(() => {})
  const abortVoiceRef = useRef<() => void>(() => {})

  const finishVoiceGuided = useCallback(async () => {
    setIsVoiceApplying(true)
    setVoicePreview("")
    const role = activeTab
    const local = parseStaffVoiceLocal(voiceLinesRef.current, role)
    try {
      const parsed = aiAvailable
        ? await parseStaffVoiceWithAI({ lines: voiceLinesRef.current, role, localFallback: local })
        : local
      applyParsedToForm(parsed)
      toast("Campos preenchidos por voz. Revise antes de salvar.", "success")
    } catch {
      applyParsedToForm(local)
      toast("Campos preenchidos localmente. Revise antes de salvar.", "info")
    } finally {
      setIsVoiceApplying(false)
      setVoiceGuided(false)
      voiceStepIndexRef.current = 0
      setVoiceStepIndex(0)
      voiceLinesRef.current = []
      abortVoiceRef.current()
    }
  }, [activeTab, aiAvailable, applyParsedToForm, toast])

  const handleVoiceField = useCallback((transcript: string) => {
    const stepIndex = voiceStepIndexRef.current
    const step = voiceSteps[stepIndex]
    if (!step) return

    const spoken = transcript.trim()
    if (!spoken) {
      toast("Não entendi. Tente falar novamente.", "error")
      startVoiceRef.current()
      return
    }

    voiceLinesRef.current.push({ field: step.key, spoken })
    const normalized = normalizeStaffVoiceField(step.key, spoken)

    let applied = false
    if (step.key === "gender") {
      if (normalized) {
        handleChange("gender", normalized as Gender)
        applied = true
      }
    } else if (typeof normalized === "string" && normalized) {
      if (step.key === "phone") handleChange("phone", formatPhoneBR(normalized))
      else if (step.key === "cpf") handleChange("cpf", formatCpfBR(normalized))
      else if (step.key === "password") {
        handleChange("password", normalized)
        handleChange("confirmPassword", normalized)
      } else {
        handleChange(step.key, normalized)
      }
      applied = true
    }

    if (!applied) {
      voiceLinesRef.current.pop()
      toast("Não entendi. Diga masculino, feminino ou outro.", "error")
      startVoiceRef.current()
      return
    }

    setVoicePreview("")
    const nextIndex = stepIndex + 1
    if (nextIndex >= voiceSteps.length) {
      void finishVoiceGuided()
      return
    }
    voiceStepIndexRef.current = nextIndex
    setVoiceStepIndex(nextIndex)
    window.setTimeout(() => startVoiceRef.current(), 350)
  }, [voiceSteps, handleChange, finishVoiceGuided, toast])

  const {
    supported: voiceSupported,
    listening: voiceListening,
    start: startVoice,
    stop: stopVoice,
    abort: abortVoice,
  } = useSpeechRecognition({
    continuous: false,
    autoSendOnEnd: true,
    onFinalTranscript: handleVoiceField,
    onInterimTranscript: setVoicePreview,
    onError: (message) => toast(message, "error"),
  })

  startVoiceRef.current = startVoice
  abortVoiceRef.current = abortVoice

  function startVoiceGuided() {
    voiceLinesRef.current = []
    voiceStepIndexRef.current = 0
    setVoiceStepIndex(0)
    setVoicePreview("")
    setVoiceGuided(true)
    startVoice()
  }

  function cancelVoiceGuided() {
    abortVoice()
    setVoiceGuided(false)
    voiceStepIndexRef.current = 0
    setVoiceStepIndex(0)
    setVoicePreview("")
    voiceLinesRef.current = []
  }

  function skipVoiceField() {
    stopVoice()
    setVoicePreview("")
    const nextIndex = voiceStepIndexRef.current + 1
    if (nextIndex >= voiceSteps.length) {
      void finishVoiceGuided()
      return
    }
    voiceStepIndexRef.current = nextIndex
    setVoiceStepIndex(nextIndex)
    window.setTimeout(() => startVoiceRef.current(), 200)
  }

  function isVoiceFieldActive(key: StaffVoiceFieldKey): boolean {
    return voiceGuided && currentVoiceStep?.key === key
  }

  useEffect(() => {
    if (!modalOpen) cancelVoiceGuided()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reset ao fechar modal
  }, [modalOpen])

  // Normaliza nomes (Title Case) e ordena alfabeticamente.
  const orderedStaff = useMemo(() => {
    const normalized = staff.map((m) => ({ ...m, name: toTitleCase(m.name) }))
    return sortByName(normalized, (m) => m.name)
  }, [staff])

  const filtered = orderedStaff.filter((m) => {
    if (m.role !== activeTab) return false
    const q = search.trim()
    if (!q) return true
    const qLower = q.toLowerCase()
    const qDigits = q.replace(/\D/g, "")
    if (m.name.toLowerCase().includes(qLower)) return true
    if (m.email.toLowerCase().includes(qLower)) return true
    if (qDigits.length > 0) {
      const cpfDigits = m.cpf?.replace(/\D/g, "") ?? ""
      const phoneDigits = m.phone?.replace(/\D/g, "") ?? ""
      if (cpfDigits.includes(qDigits) || phoneDigits.includes(qDigits)) return true
    }
    return false
  })
  const confirmTarget = orderedStaff.find((m) => m.id === confirmId)

  function openCreate() {
    setEditingMember(null); setForm(EMPTY_FORM); setErrors({})
    setShowPass(false); setShowConfirm(false); setModalOpen(true)
  }

  function openEdit(member: StaffMember) {
    setEditingMember(member); setForm(memberToForm(member)); setErrors({})
    setShowPass(false); setShowConfirm(false); setModalOpen(true)
  }

  function validate(): { ok: boolean; firstError?: string } {
    const role = editingMember?.role ?? activeTab
    const e: Partial<Record<keyof StaffForm, string>> = {}
    if (!form.name.trim())  e.name  = "Nome obrigatório"
    else if (!hasAtLeastTwoNames(form.name)) e.name = "Informe pelo menos dois nomes"
    if (!form.email.trim()) e.email = "E-mail obrigatório"
    else if (!isValidEmail(form.email)) e.email = "E-mail inválido"
    if (!form.phone.trim()) e.phone = "Telefone obrigatório"
    else if (onlyDigits(form.phone).length !== 11) e.phone = "Telefone deve estar no formato (00)-00000-0000"
    if (!form.gender) e.gender = "Sexo obrigatório"
    const cpfDigits = onlyDigits(form.cpf)
    if (!editingMember) {
      if (!cpfDigits) e.cpf = "CPF obrigatório"
      else if (cpfDigits.length !== 11) e.cpf = "CPF deve ter 11 dígitos"
      else if (!isValidCpf(cpfDigits)) e.cpf = "CPF inválido"
    }
    if (!editingMember && (role === "secretary" || role === "manager") && !form.department.trim()) {
      e.department = "Departamento obrigatório"
    }
    if (role === "doctor") {
      const crmDigitsOnly = onlyDigits(form.crmNum)
      if (!crmDigitsOnly)             e.crmNum = "CRM obrigatório"
      else if (crmDigitsOnly.length < 4) e.crmNum = "CRM deve ter pelo menos 4 dígitos"
      if (!form.crmUf.trim())         e.crmUf  = "UF obrigatória"
      if (!form.specialty.trim())     e.specialty = "Selecione uma especialidade"
    }
    if (!editingMember) {
      if (!form.password)             e.password        = "Senha obrigatória"
      else if (form.password.length < 6) e.password     = "Mínimo 6 caracteres"
      if (!form.confirmPassword)      e.confirmPassword = "Confirmação obrigatória"
      else if (form.password !== form.confirmPassword) e.confirmPassword = "Senhas não coincidem"
    }
    setErrors(e)
    const firstError = Object.values(e)[0]
    return { ok: Object.keys(e).length === 0, firstError }
  }

  async function handleSave() {
    if (saveLockRef.current) return
    if (isSaving) return
    const validation = validate()
    if (!validation.ok) {
      toast(validation.firstError ?? "Revise os campos destacados antes de salvar.", "error")
      return
    }
    saveLockRef.current = true
    setIsSaving(true)
    try {
      const role = editingMember?.role ?? activeTab
      const cpfDigits   = onlyDigits(form.cpf)
      const phoneDigits = onlyDigits(form.phone)
      const crmNumDigits = onlyDigits(form.crmNum)
      const department = form.department.trim() || editingMember?.department?.trim() || undefined

      const base = {
        name:       form.name.trim(),
        email:      form.email.trim(),
        phone:      phoneDigits,
        gender:     form.gender || undefined,
        status:     form.status,
        role,
        cpf:        cpfDigits || editingMember?.cpf?.replace(/\D/g, "") || undefined,
        crm:        role === "doctor" ? formatCrm(crmNumDigits, form.crmUf) : undefined,
        specialty:  role === "doctor" ? form.specialty : undefined,
        department: role !== "doctor" ? department : undefined,
      }

      if (editingMember) {
        await onUpdate({ ...editingMember, ...base })
        toast(`${form.name} atualizado com sucesso.`, "success")
      } else {
        const doctorExtra = role === "doctor"
          ? { cpf: cpfDigits, crmNum: crmNumDigits, crmUf: form.crmUf, specialty: form.specialty }
          : undefined
        await onAdd(base, form.password, doctorExtra)
        toast(`${form.name} cadastrado! Já pode acessar o sistema com o e-mail e senha definidos.`, "success")
      }
      setModalOpen(false)
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Erro ao salvar"
      toast(raw, "error")
    } finally {
      setIsSaving(false)
      saveLockRef.current = false
    }
  }

  async function handleDelete(id: string) {
    await onDelete(id)
    toast("Profissional removido.", "info")
    setConfirmId(null)
  }

  const currentTab = TABS.find((t) => t.id === activeTab)!
  const currentRoleLabel = getRoleLabel(activeTab, form.gender || undefined)

  return (
    <div>
      <Topbar title="Equipe" subtitle="Gerencie os profissionais da clínica"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {onRefresh && <RefreshButton onRefresh={onRefresh} />}
            <Button onClick={openCreate} icon={<PlusIcon />}>Novo {currentTab.singular}</Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map((tab) => {
          const count = staff.filter((m) => m.role === tab.id).length
          return (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSearch("") }}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}>
              {tab.label}
              <span className={`${styles.tabCount} ${activeTab === tab.id ? styles.tabCountActive : ""}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className={styles.searchRow}>
        <div className={styles.searchWrapper}>
          <svg className={styles.searchIcon} width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input className={styles.searchInput} value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar ${currentTab.label.toLowerCase()}...`} />
        </div>
      </div>

      {/* Table */}
      <Card>
        {isLoading ? (
          <div className={styles.empty}>
            <p>Carregando equipe...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            <p>Nenhum {currentTab.singular} encontrado</p>
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Profissional</th>
                  <th>CPF</th>
                  {activeTab === "doctor" ? <th>CRM / Especialidade</th> : <th>Departamento</th>}
                  <th>Contato</th><th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className={styles.nameCell}>
                        <Avatar name={member.name} size="sm" />
                        <div>
                          <p className={styles.memberName}>{member.name}</p>
                          <p className={styles.memberEmail}>{member.email}</p>
                          <p className={styles.memberEmail}>{getRoleLabel(member.role, member.gender)}</p>
                        </div>
                      </div>
                    </td>
                    <td><p className={styles.cellMain}>{displayMaskedCpf(member.cpf)}</p></td>
                    {activeTab === "doctor"
                      ? (
                        <td>
                          <p className={styles.cellMain}>
                            {displayCrm(member.crm)}
                            {(!member.crm || !member.specialty) && (
                              <span title="Dados profissionais incompletos — edite e preencha CRM e especialidade"
                                style={{ marginLeft: 6, color: "#f59e0b", fontSize: 13, cursor: "default" }}>⚠</span>
                            )}
                          </p>
                          <p className={styles.cellSub}>{member.specialty || "—"}</p>
                        </td>
                      )
                      : <td><p className={styles.cellMain}>{member.department || "—"}</p></td>
                    }
                    <td><p className={styles.cellMain}>{displayMaskedPhone(member.phone)}</p></td>
                    <td><Badge>{formatRecordStatus(member.status)}</Badge></td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.actionBtn} onClick={() => openEdit(member)} title="Editar"><EditIcon /></button>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setConfirmId(member.id)} title="Remover"><TrashIcon /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}
        title={editingMember ? "Editar profissional" : `Cadastrar ${currentRoleLabel.toLowerCase()}`}
        subtitle={editingMember ? `Editando: ${editingMember.name}` : "Preencha os dados e defina a senha de acesso"}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : editingMember ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </>
        }
      >
        {!editingMember && voiceSupported && (
          <div className={styles.voicePanel}>
            {!voiceGuided ? (
              <>
                <p className={styles.voicePanelText}>
                  Fale os dados campo a campo. A IA interpreta e preenche o formulário.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={startVoiceGuided}
                  disabled={isVoiceApplying}
                >
                  Preencher por voz
                </Button>
              </>
            ) : (
              <>
                <div className={styles.voicePanelHeader}>
                  <span className={styles.voiceStepBadge}>
                    {Math.min(voiceStepIndex + 1, voiceSteps.length)}/{voiceSteps.length}
                  </span>
                  <p className={styles.voicePrompt}>
                    {isVoiceApplying ? "Interpretando com IA..." : currentVoiceStep?.prompt}
                  </p>
                </div>
                {voicePreview && (
                  <p className={styles.voicePreview}>Ouvindo: {voicePreview}</p>
                )}
                <div className={styles.voicePanelActions}>
                  <button
                    type="button"
                    className={`${styles.voiceMicBtn} ${voiceListening ? styles.voiceMicBtnActive : ""}`}
                    onClick={voiceListening ? stopVoice : startVoice}
                    disabled={isVoiceApplying}
                  >
                    {voiceListening ? "Parar" : "Falar"}
                  </button>
                  <Button type="button" variant="ghost" size="sm" onClick={skipVoiceField} disabled={isVoiceApplying}>
                    Pular campo
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={cancelVoiceGuided} disabled={isVoiceApplying}>
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {!editingMember && !voiceSupported && (
          <p className={styles.voiceUnsupported}>
            Preenchimento por voz requer Chrome ou Edge com microfone liberado.
          </p>
        )}

        <div className={styles.formGrid}>

          {/* Dados pessoais */}
          <Section title="Dados pessoais">
            <div className={styles.grid2}>
              <Input label="Nome completo" value={form.name} onChange={(e) => handleChange("name", e.target.value)}
                error={errors.name} required className={`${styles.colSpan2} ${isVoiceFieldActive("name") ? styles.voiceFieldActive : ""}`} />
              <Input label="E-mail" type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)}
                error={errors.email} required className={isVoiceFieldActive("email") ? styles.voiceFieldActive : undefined} />
              <Input label="Telefone" value={form.phone} onChange={(e) => handleChange("phone", formatPhoneBR(e.target.value))}
                error={errors.phone} required placeholder="(00) 00000-0000" inputMode="tel" maxLength={15}
                className={isVoiceFieldActive("phone") ? styles.voiceFieldActive : undefined} />
              <Select label="Sexo" value={form.gender} onChange={(e) => handleChange("gender", e.target.value)}
                options={GENDER_OPTIONS} required error={errors.gender}
                className={isVoiceFieldActive("gender") ? styles.voiceFieldActive : undefined} />
              <Select label="Status" value={form.status} onChange={(e) => handleChange("status", e.target.value)} options={[...RECORD_STATUS_OPTIONS]} />
            </div>
          </Section>

          {/* Dados profissionais — Médico */}
          {activeTab === "doctor" && (
            <Section title="Dados profissionais">
              <div className={styles.grid2}>
                <Input label="CPF" value={form.cpf} onChange={(e) => handleChange("cpf", formatCpfBR(e.target.value))}
                  error={errors.cpf} required placeholder="000.000.000-00" inputMode="numeric" maxLength={14}
                  className={`${styles.colSpan2} ${isVoiceFieldActive("cpf") ? styles.voiceFieldActive : ""}`} />
                <Input label="Número CRM" value={form.crmNum} onChange={(e) => handleChange("crmNum", onlyDigits(e.target.value).slice(0, 7))}
                  error={errors.crmNum} required placeholder="Ex: 123456" inputMode="numeric" maxLength={7}
                  className={isVoiceFieldActive("crmNum") ? styles.voiceFieldActive : undefined} />
                <Select label="UF do CRM" value={form.crmUf} onChange={(e) => handleChange("crmUf", e.target.value)}
                  options={UF_LIST} required error={errors.crmUf}
                  className={isVoiceFieldActive("crmUf") ? styles.voiceFieldActive : undefined} />
                <Select label="Especialidade" value={form.specialty} onChange={(e) => handleChange("specialty", e.target.value)}
                  options={SPECIALTIES} required className={`${styles.colSpan2} ${isVoiceFieldActive("specialty") ? styles.voiceFieldActive : ""}`}
                  error={errors.specialty} />
              </div>
            </Section>
          )}

          {/* Dados profissionais — Secretária/Gestor */}
          {(activeTab === "secretary" || activeTab === "manager") && (
            <Section title="Dados profissionais">
              <div className={styles.grid2}>
                <Input label="CPF" required value={form.cpf} onChange={(e) => handleChange("cpf", formatCpfBR(e.target.value))}
                  error={errors.cpf} placeholder="000.000.000-00" inputMode="numeric" maxLength={14}
                  className={isVoiceFieldActive("cpf") ? styles.voiceFieldActive : undefined} />
                <Input label="Departamento" value={form.department} onChange={(e) => handleChange("department", e.target.value)}
                  error={errors.department}
                  required={!editingMember}
                  placeholder={activeTab === "secretary" ? "Ex: Recepção" : "Ex: Gestão Geral"}
                  className={isVoiceFieldActive("department") ? styles.voiceFieldActive : undefined} />
              </div>
            </Section>
          )}

          {/* Acesso ao sistema — somente no cadastro */}
          {!editingMember && (
            <Section title="Acesso ao sistema">
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginBottom: 12 }}>
                Defina a senha que o profissional usará para acessar o sistema.
              </p>
              <div className={styles.grid2}>
                <div className={isVoiceFieldActive("password") ? styles.voiceFieldActive : undefined}>
                  <PasswordInput label="Senha" value={form.password} show={showPass}
                    onToggle={() => setShowPass((v) => !v)} onChange={(v) => handleChange("password", v)}
                    error={errors.password} />
                </div>
                <PasswordInput label="Confirmar senha" value={form.confirmPassword} show={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)} onChange={(v) => handleChange("confirmPassword", v)}
                  error={errors.confirmPassword} placeholder="Repita a senha" />
              </div>
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "var(--muted)", fontSize: 11, color: "var(--muted-foreground)" }}>
                💡 Use letras maiúsculas, minúsculas, números e símbolos. Ex: <strong>Senha@2025</strong>
              </div>
            </Section>
          )}
        </div>
      </Modal>

      <ConfirmDialog isOpen={confirmId !== null} onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId !== null && handleDelete(confirmId)}
        title="Remover profissional"
        message={`Tem certeza que deseja remover ${confirmTarget?.name ?? "este profissional"}?`}
        confirmLabel="Remover" variant="danger" />
    </div>
  )
}

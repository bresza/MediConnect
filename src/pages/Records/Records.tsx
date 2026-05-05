import { useState } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { Input } from "../../components/ui/Input/Input"
import { Select } from "../../components/ui/Select/Select"
import { Section } from "../../components/ui/Section/Section"
import { formatDate } from "../../utils"
import { useStaff } from "../../hooks/useStaff"
import type { MedicalRecord, Patient, PageId, User } from "../../types"
import styles from "./Records.module.css"

type RecordForm = {
  patientId: string; doctorId: string; doctorName: string; date: string
  chiefComplaint: string; currentHistory: string; allergies: string
  medications: string; personalHistory: string; familyHistory: string
  bloodPressure: string; heartRate: string; temperature: string
  weight: string; height: string; oxygenSaturation: string
  physicalExam: string; diagnosis: string; cid10: string
  treatmentPlan: string; prescriptions: string; examRequests: string
  returnDate: string; observations: string
}

const EMPTY_FORM: RecordForm = {
  patientId: "", doctorId: "", doctorName: "", date: new Date().toISOString().slice(0, 10),
  chiefComplaint: "", currentHistory: "", allergies: "", medications: "",
  personalHistory: "", familyHistory: "",
  bloodPressure: "", heartRate: "", temperature: "", weight: "", height: "", oxygenSaturation: "",
  physicalExam: "", diagnosis: "", cid10: "", treatmentPlan: "",
  prescriptions: "", examRequests: "", returnDate: "", observations: "",
}

function recordToForm(r: MedicalRecord): RecordForm {
  return {
    patientId: String(r.patientId), doctorId: r.doctorId, doctorName: r.doctorName, date: r.date,
    chiefComplaint: r.chiefComplaint,
    currentHistory: r.currentHistory ?? "", allergies: r.allergies ?? "",
    medications: r.medications ?? "", personalHistory: r.personalHistory ?? "",
    familyHistory: r.familyHistory ?? "",
    bloodPressure:     r.vitalSigns?.bloodPressure ?? "",
    heartRate:         r.vitalSigns?.heartRate     != null ? String(r.vitalSigns.heartRate)        : "",
    temperature:       r.vitalSigns?.temperature   != null ? String(r.vitalSigns.temperature)      : "",
    weight:            r.vitalSigns?.weight        != null ? String(r.vitalSigns.weight)           : "",
    height:            r.vitalSigns?.height        != null ? String(r.vitalSigns.height)           : "",
    oxygenSaturation:  r.vitalSigns?.oxygenSaturation != null ? String(r.vitalSigns.oxygenSaturation) : "",
    physicalExam: r.physicalExam ?? "", diagnosis: r.diagnosis ?? "", cid10: r.cid10 ?? "",
    treatmentPlan: r.treatmentPlan ?? "", prescriptions: r.prescriptions ?? "",
    examRequests: r.examRequests ?? "", returnDate: r.returnDate ?? "", observations: r.observations ?? "",
  }
}

interface RecordsProps {
  records: MedicalRecord[]; patients: Patient[]
  filterPatientId?: string | null; currentUser: User
  onAddRecord: (r: Omit<MedicalRecord, "id">) => void | Promise<void>
  onUpdateRecord: (r: MedicalRecord) => void | Promise<void>
  onNavigate: (page: PageId) => void
}

export function Records({ records, patients, filterPatientId, currentUser, onAddRecord, onUpdateRecord, onNavigate }: RecordsProps) {
  const { staff } = useStaff()
  const doctors = staff.filter((member) => member.role === "doctor")
  const [view, setView]                   = useState<"list" | "editor">("list")
  const [editingRecord, setEditing]       = useState<MedicalRecord | null>(null)
  const [form, setForm]                   = useState<RecordForm>(EMPTY_FORM)
  const [errors, setErrors]               = useState<Partial<Record<keyof RecordForm, string>>>({})
  const [saved, setSaved]                 = useState(false)
  const [saveError, setSaveError]         = useState<string | null>(null)
  const [isSaving, setIsSaving]           = useState(false)
  const [search, setSearch]               = useState("")
  const [filterStatus, setFilterStatus]   = useState<"all" | "open" | "finalized">("all")
  const [patientFilter, setPatientFilter] = useState<string | null>(filterPatientId ?? null)

  const isEditing = !!editingRecord
  const isDoctor  = currentUser.role === "doctor"

  function set(field: keyof RecordForm, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: undefined }))
  }

  function openNew() {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      patientId: patientFilter ? String(patientFilter) : "",
      doctorId: isDoctor ? currentUser.id : "",
      doctorName: isDoctor ? currentUser.name : "",
    })
    setErrors({}); setSaved(false); setSaveError(null); setView("editor")
  }

  function openEdit(record: MedicalRecord) {
    setEditing(record)
    setForm(recordToForm(record))
    setErrors({}); setSaved(false); setSaveError(null); setView("editor")
  }

  function validate(): boolean {
    const e: Partial<Record<keyof RecordForm, string>> = {}
    if (!form.patientId)             e.patientId      = "Selecione o paciente"
    if (!form.doctorName)            e.doctorName     = "Selecione o médico"
    if (!form.chiefComplaint.trim()) e.chiefComplaint = "Queixa principal obrigatória"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function buildRecord(status: "open" | "finalized"): MedicalRecord {
    const patient = patients.find(p => p.id === form.patientId)
    return {
      ...(editingRecord ?? {}),
      id: editingRecord?.id ?? crypto.randomUUID(),
      patientId: form.patientId,
      patientName: patient?.name ?? "",
      doctorId: form.doctorId || currentUser.id,
      doctorName: form.doctorName,
      date: form.date,
      chiefComplaint:  form.chiefComplaint,
      currentHistory:  form.currentHistory  || undefined,
      allergies:       form.allergies       || undefined,
      medications:     form.medications     || undefined,
      personalHistory: form.personalHistory || undefined,
      familyHistory:   form.familyHistory   || undefined,
      vitalSigns: {
        bloodPressure:    form.bloodPressure    || undefined,
        heartRate:        form.heartRate        ? Number(form.heartRate)        : undefined,
        temperature:      form.temperature      ? Number(form.temperature)      : undefined,
        weight:           form.weight           ? Number(form.weight)           : undefined,
        height:           form.height           ? Number(form.height)           : undefined,
        oxygenSaturation: form.oxygenSaturation ? Number(form.oxygenSaturation) : undefined,
      },
      physicalExam:  form.physicalExam  || undefined,
      diagnosis:     form.diagnosis     || undefined,
      cid10:         form.cid10         || undefined,
      treatmentPlan: form.treatmentPlan || undefined,
      prescriptions: form.prescriptions || undefined,
      examRequests:  form.examRequests  || undefined,
      returnDate:    form.returnDate    || undefined,
      observations:  form.observations  || undefined,
      status,
      createdAt:  editingRecord?.createdAt ?? new Date().toISOString().slice(0, 10),
      updatedAt:  new Date().toISOString().slice(0, 10),
      updatedBy:  currentUser.name,
    }
  }

  async function handleSave(status: "open" | "finalized") {
    if (!validate()) return
    const record = buildRecord(status)
    setIsSaving(true)
    setSaveError(null)
    try {
      if (isEditing) await onUpdateRecord(record)
      else await onAddRecord(record)
      setSaved(true)
      setTimeout(() => setView("list"), 600)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Erro ao salvar prontuario")
    } finally {
      setIsSaving(false)
    }
  }

  // ── Filters ────────────────────────────────────────────────────
  const activePatient = patients.find(p => p.id === patientFilter)
  const filtered = records.filter(r =>
    (patientFilter == null || String(r.patientId) === patientFilter) &&
    (filterStatus === "all" || r.status === filterStatus) &&
    (r.patientName.toLowerCase().includes(search.toLowerCase()) ||
     r.chiefComplaint.toLowerCase().includes(search.toLowerCase()))
  )

  // ── Saved feedback ─────────────────────────────────────────────
  if (saved) {
    return (
      <div className={styles.savedWrap}>
        <div className={styles.savedCard}>
          <div className={styles.savedIcon}>
            <svg width="28" height="28" fill="none" stroke="var(--primary)" strokeWidth="2.5"
              viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className={styles.savedTitle}>{isEditing ? "Prontuário atualizado" : "Prontuário salvo"}</p>
          <p className={styles.savedSub}>Redirecionando para a lista...</p>
        </div>
      </div>
    )
  }

  // ── Editor ─────────────────────────────────────────────────────
  if (view === "editor") {
    const selectedPatient = patients.find(p => p.id === form.patientId)

    return (
      <div>
        <Topbar
          title={isEditing ? "Editar Prontuário" : "Novo Prontuário"}
          subtitle={selectedPatient ? `Paciente: ${selectedPatient.name}` : "Preencha os dados clínicos"}
          action={<Button variant="ghost" onClick={() => setView("list")}>← Voltar</Button>}
        />

        <Card className={styles.formCard}>

          {/* ── Identificação ─────────────────────────────────── */}
          <Section title="Identificação">
            <div className={styles.grid3}>
              <Select
                label="Paciente" required
                options={patients.map(p => p.name)}
                placeholder="Selecione o paciente"
                value={selectedPatient?.name ?? ""}
                onChange={e => {
                  const p = patients.find(pt => pt.name === e.target.value)
                  set("patientId", p ? String(p.id) : "")
                }}
              />
              {isDoctor ? (
                <div>
                  <p className={styles.fieldLabel}>Médico responsável</p>
                  <div className={styles.lockedField}>
                    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"
                      viewBox="0 0 24 24" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                    {currentUser.name}
                  </div>
                </div>
              ) : doctors.length > 0 ? (
                <Select
                  label="Médico responsável" required
                  options={doctors.map((doctor) => ({ value: doctor.id, label: doctor.name }))}
                  placeholder="Selecione o médico"
                  value={form.doctorId}
                  onChange={e => {
                    const doctor = doctors.find((d) => d.id === e.target.value)
                    set("doctorId", doctor?.id ?? "")
                    set("doctorName", doctor?.name ?? "")
                  }}
                />
              ) : (
                <Input
                  label="Médico responsável"
                  required
                  placeholder="Nome do médico"
                  value={form.doctorName}
                  onChange={e => {
                    set("doctorName", e.target.value)
                    set("doctorId", "")
                  }}
                />
              )}
              <Input label="Data da consulta" type="date" required
                value={form.date} onChange={e => set("date", e.target.value)} />
            </div>
            {(errors.patientId || errors.doctorName) && (
              <div className={styles.errorRow}>
                {errors.patientId  && <p className={styles.errorMsg}>{errors.patientId}</p>}
                {errors.doctorName && <p className={styles.errorMsg}>{errors.doctorName}</p>}
              </div>
            )}
            {saveError && <p className={styles.errorMsg}>{saveError}</p>}
          </Section>

          {/* ── Anamnese ──────────────────────────────────────── */}
          <Section title="Anamnese">
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Queixa principal <span className={styles.req}>*</span></label>
              <textarea rows={2} placeholder="Motivo da consulta..."
                value={form.chiefComplaint} onChange={e => set("chiefComplaint", e.target.value)}
                className={`${styles.textarea} ${errors.chiefComplaint ? styles.textareaError : ""}`} />
              {errors.chiefComplaint && <p className={styles.errorMsg}>{errors.chiefComplaint}</p>}
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>História da doença atual</label>
              <textarea rows={4} placeholder="Descreva a história da doença atual..."
                value={form.currentHistory} onChange={e => set("currentHistory", e.target.value)}
                className={styles.textarea} />
            </div>
            <div className={styles.grid2}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Alergias</label>
                <textarea rows={2} placeholder="Alergias conhecidas ou 'Nega alergias'..."
                  value={form.allergies} onChange={e => set("allergies", e.target.value)}
                  className={styles.textarea} />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Medicamentos em uso</label>
                <textarea rows={2} placeholder="Medicamentos contínuos..."
                  value={form.medications} onChange={e => set("medications", e.target.value)}
                  className={styles.textarea} />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Antecedentes pessoais</label>
                <textarea rows={2} placeholder="Doenças prévias, cirurgias..."
                  value={form.personalHistory} onChange={e => set("personalHistory", e.target.value)}
                  className={styles.textarea} />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Antecedentes familiares</label>
                <textarea rows={2} placeholder="Histórico familiar relevante..."
                  value={form.familyHistory} onChange={e => set("familyHistory", e.target.value)}
                  className={styles.textarea} />
              </div>
            </div>
          </Section>

          {/* ── Exame Físico ──────────────────────────────────── */}
          <Section title="Exame Físico">
            <div className={styles.vitalsGrid}>
              <Input label="PA (mmHg)"   placeholder="120/80" value={form.bloodPressure}    onChange={e => set("bloodPressure", e.target.value)} />
              <Input label="FC (bpm)"    type="number" placeholder="72"   value={form.heartRate}       onChange={e => set("heartRate", e.target.value)} />
              <Input label="Temp. (°C)"  type="number" placeholder="36.5" value={form.temperature}     onChange={e => set("temperature", e.target.value)} />
              <Input label="SpO₂ (%)"    type="number" placeholder="98"   value={form.oxygenSaturation} onChange={e => set("oxygenSaturation", e.target.value)} />
              <Input label="Peso (kg)"   type="number" placeholder="70"   value={form.weight}          onChange={e => set("weight", e.target.value)} />
              <Input label="Altura (cm)" type="number" placeholder="170"  value={form.height}          onChange={e => set("height", e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Descrição do exame físico</label>
              <textarea rows={4} placeholder="Achados do exame físico..."
                value={form.physicalExam} onChange={e => set("physicalExam", e.target.value)}
                className={styles.textarea} />
            </div>
          </Section>

          {/* ── Diagnóstico e Conduta ─────────────────────────── */}
          <Section title="Diagnóstico e Conduta">
            <div className={styles.grid2}>
              <Input label="Diagnóstico" placeholder="Hipótese diagnóstica..."
                value={form.diagnosis} onChange={e => set("diagnosis", e.target.value)} />
              <Input label="CID-10" placeholder="Ex: J06.9"
                value={form.cid10} onChange={e => set("cid10", e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Plano terapêutico / Conduta</label>
              <textarea rows={3} placeholder="Conduta clínica adotada..."
                value={form.treatmentPlan} onChange={e => set("treatmentPlan", e.target.value)}
                className={styles.textarea} />
            </div>
            <div className={styles.grid2}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Prescrição</label>
                <textarea rows={4} placeholder="Medicamentos prescritos (um por linha)..."
                  value={form.prescriptions} onChange={e => set("prescriptions", e.target.value)}
                  className={styles.textarea} />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Exames solicitados</label>
                <textarea rows={4} placeholder="Exames solicitados (um por linha)..."
                  value={form.examRequests} onChange={e => set("examRequests", e.target.value)}
                  className={styles.textarea} />
              </div>
            </div>
            <div className={styles.grid2}>
              <Input label="Data de retorno" type="date"
                value={form.returnDate} onChange={e => set("returnDate", e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Observações</label>
              <textarea rows={2} placeholder="Observações adicionais..."
                value={form.observations} onChange={e => set("observations", e.target.value)}
                className={styles.textarea} />
            </div>
          </Section>

          {/* ── Footer ────────────────────────────────────────── */}
          <div className={styles.formFooter}>
            <Button variant="ghost" onClick={() => setView("list")}>Cancelar</Button>
            <div className={styles.footerRight}>
              <Button variant="outline" onClick={() => handleSave("open")} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Salvar rascunho"}
              </Button>
              <Button onClick={() => handleSave("finalized")} disabled={isSaving}>
                {isSaving ? "Salvando..." : "Finalizar prontuário"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────
  const STATUS_LABELS = { all: "Todos", open: "Aberto", finalized: "Finalizado" } as const

  return (
    <div>
      <Topbar
        title="Prontuários"
        subtitle={activePatient ? `Prontuários de ${activePatient.name}` : `${records.length} prontuários registrados`}
        action={<Button onClick={openNew}>+ Novo prontuário</Button>}
      />

      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
            </svg>
          </span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por paciente ou queixa..." className={styles.searchInput} />
        </div>
        {(["all", "open", "finalized"] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`${styles.filterBtn} ${filterStatus === s ? styles.filterBtnActive : ""}`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
        {activePatient && (
          <button className={styles.clearFilter} onClick={() => setPatientFilter(null)}>
            {activePatient.name} ×
          </button>
        )}
      </div>

      <Card>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                {["Paciente", "Data", "Médico", "Queixa principal", "Retorno", "Status", "Ações"].map(h => (
                  <th key={h} className={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className={styles.empty}>Nenhum prontuário encontrado.</td></tr>
              ) : filtered.map((r, i) => {
                const isLast = i === filtered.length - 1
                const tdClass = `${styles.td} ${isLast ? styles.tdLast : ""}`
                return (
                  <tr key={r.id}>
                    <td className={tdClass}>
                      <div className={styles.patientCell}>
                        <Avatar name={r.patientName} size="sm" />
                        <span className={styles.patientName}>{r.patientName}</span>
                      </div>
                    </td>
                    <td className={tdClass}>{formatDate(r.date)}</td>
                    <td className={tdClass}>{r.doctorName}</td>
                    <td className={tdClass}><span className={styles.complaint}>{r.chiefComplaint}</span></td>
                    <td className={tdClass}>{r.returnDate ? formatDate(r.returnDate) : "—"}</td>
                    <td className={tdClass}><Badge>{r.status}</Badge></td>
                    <td className={tdClass}>
                      <div className={styles.actions}>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Editar</Button>
                        <Button size="sm" variant="ghost" onClick={() => onNavigate("patients")}>Paciente</Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

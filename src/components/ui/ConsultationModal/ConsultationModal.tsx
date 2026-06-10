// ─────────────────────────────────────────────────────────────────
// ConsultationModal — fluxo de atendimento médico.
//
// O modal cobre 3 etapas, em abas, todas opcionais mas o
// **Prontuário** com queixa e diagnóstico é obrigatório para concluir:
//
//   1. Atendimento (Prontuário):
//        chiefComplaint*, currentHistory, vitalSigns, physicalExam,
//        diagnosis*, cid10, treatmentPlan, returnDate, observations.
//        Persistido via `createMedicalRecord` (API: tabela `reports`
//        com `exam = "Prontuario Medico"`).
//
//   2. Receita (opcional): lista de medicamentos. Cria uma
//      Prescription quando houver pelo menos um medicamento.
//      Persistido via `createPrescription` (API: tabela `reports`
//      com `exam = "Receita Medica"`).
//
//   3. Cobrança: value*, paymentMethod, status, dueDate, discount,
//      healthInsurance, observations. Persistido via
//      `createFinancialRecord` (API: tabela `reports` com
//      `exam = "Registro Financeiro"`).
//
// Ao "Concluir atendimento": grava os 3 registros (ou apenas os
// preenchidos) e atualiza o `appointment.status` para "completed".
//
// Em qualquer falha intermediária, o modal NÃO marca como completed
// e mostra mensagem clara para o médico tentar novamente.
// ─────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react"
import { Modal } from "../Modal/Modal"
import { Button } from "../Button/Button"
import { Avatar } from "../Avatar/Avatar"
import { normalizeCid10, validateCid10 } from "../../../utils/cid10"
import type {
  Appointment,
  FinancialRecord,
  MedicalRecord,
  Patient,
  PaymentMethod,
  PaymentStatus,
  Prescription,
  PrescriptionMedication,
  PrescriptionType,
  User,
  VitalSigns,
} from "../../../types"
import styles from "./ConsultationModal.module.css"

type Tab = "record" | "prescription" | "billing"

export interface ConsultationModalProps {
  isOpen:        boolean
  onClose:       () => void
  appointment:   Appointment | null
  patient?:      Patient | null
  currentUser:   User
  defaultPrice?: number
  onComplete: (input: {
    appointmentId: string
    medicalRecord: Omit<MedicalRecord, "id">
    prescription?: Omit<Prescription, "id">
    financialRecord: Omit<FinancialRecord, "id">
  }) => Promise<void>
}

interface ConsultationForm {
  // Prontuário
  chiefComplaint: string
  currentHistory: string
  allergies:      string
  medicationsUse: string
  vitalSigns:     VitalSigns
  physicalExam:   string
  diagnosis:      string
  cid10:          string
  treatmentPlan:  string
  examRequests:   string
  returnDate:     string
  observations:   string

  // Receita
  prescriptionType: PrescriptionType
  medications:      PrescriptionMedication[]
  prescriptionNotes: string

  // Cobrança
  value:            string
  discount:         string
  paymentMethod:    PaymentMethod
  paymentStatus:    PaymentStatus
  healthInsurance:  string
  dueDate:          string
  billingNotes:     string
}

function emptyMedication(): PrescriptionMedication {
  return {
    id: `med-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    concentration: "",
    form: "",
    quantity: "",
    posology: "",
    duration: "",
    instructions: "",
  }
}

function buildInitialForm(defaultPrice: number): ConsultationForm {
  const today = new Date().toISOString().slice(0, 10)
  return {
    chiefComplaint: "",
    currentHistory: "",
    allergies:      "",
    medicationsUse: "",
    vitalSigns:     {},
    physicalExam:   "",
    diagnosis:      "",
    cid10:          "",
    treatmentPlan:  "",
    examRequests:   "",
    returnDate:     "",
    observations:   "",
    prescriptionType: "simple",
    medications:      [],
    prescriptionNotes: "",
    value:           defaultPrice ? String(defaultPrice.toFixed(2)) : "",
    discount:        "",
    paymentMethod:   "Pix",
    paymentStatus:   "Paid",
    healthInsurance: "",
    dueDate:         today,
    billingNotes:    "",
  }
}

const PAYMENT_METHODS: PaymentMethod[] = ["Pix", "Card", "Cash", "Insurance", "Transfer"]
const PAYMENT_STATUSES: PaymentStatus[] = ["Paid", "Pending", "Overdue", "Cancelled"]
const PRESCRIPTION_TYPES: { value: PrescriptionType; label: string }[] = [
  { value: "simple",        label: "Simples" },
  { value: "special",       label: "Controle especial" },
  { value: "antimicrobial", label: "Antimicrobiano" },
]

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  Pix:       "Pix",
  Card:      "Cartão",
  Cash:      "Dinheiro",
  Insurance: "Convênio",
  Transfer:  "Transferência",
}
const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  Paid:      "Pago",
  Pending:   "Pendente",
  Overdue:   "Atrasado",
  Cancelled: "Cancelado",
}

function num(value: string): number {
  const parsed = Number(value.replace(",", "."))
  return Number.isFinite(parsed) ? parsed : 0
}

function buildPatientInfo(patient?: Patient | null): string {
  if (!patient) return ""
  const parts = [patient.name]
  if (patient.dob) parts.push(`Nasc. ${new Date(patient.dob).toLocaleDateString("pt-BR")}`)
  if (patient.cpf) parts.push(`CPF ${patient.cpf}`)
  return parts.join(" · ")
}

export function ConsultationModal({
  isOpen, onClose, appointment, patient, currentUser, defaultPrice = 0, onComplete,
}: ConsultationModalProps) {
  const [tab, setTab]           = useState<Tab>("record")
  const [form, setForm]         = useState<ConsultationForm>(() => buildInitialForm(defaultPrice))
  const [error, setError]       = useState<string | null>(null)
  const [cidError, setCidError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function setField<K extends keyof ConsultationForm>(key: K, value: ConsultationForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  function setVital<K extends keyof VitalSigns>(key: K, value: VitalSigns[K]) {
    setForm((prev) => ({ ...prev, vitalSigns: { ...prev.vitalSigns, [key]: value } }))
  }

  function addMedication() {
    setForm((prev) => ({ ...prev, medications: [...prev.medications, emptyMedication()] }))
  }
  function removeMedication(id: string) {
    setForm((prev) => ({ ...prev, medications: prev.medications.filter((m) => m.id !== id) }))
  }
  function updateMedication(id: string, field: keyof PrescriptionMedication, value: string) {
    setForm((prev) => ({
      ...prev,
      medications: prev.medications.map((m) => m.id === id ? { ...m, [field]: value } : m),
    }))
  }

  const totals = useMemo(() => {
    const value = num(form.value)
    const discount = num(form.discount)
    return { value, discount, total: Math.max(0, value - discount) }
  }, [form.value, form.discount])

  async function handleComplete() {
    if (!appointment) return

    if (!form.chiefComplaint.trim()) { setTab("record"); setError("Informe a queixa principal."); return }
    if (!form.diagnosis.trim())      { setTab("record"); setError("Informe o diagnóstico."); return }
    const cidValidationError = validateCid10(form.cid10)
    if (cidValidationError) { setTab("record"); setCidError(cidValidationError); setError("CID-10 inválido. Corrija antes de concluir."); return }
    if (totals.value <= 0)           { setTab("billing"); setError("Informe o valor do atendimento."); return }

    const today = new Date().toISOString().slice(0, 10)
    const nowIso = new Date().toISOString()

    const medicalRecord: Omit<MedicalRecord, "id"> = {
      patientId:       appointment.patientId,
      patientName:     appointment.patientName,
      doctorId:        currentUser.id,
      doctorName:      currentUser.name,
      appointmentId:   appointment.id,
      date:            today,
      chiefComplaint:  form.chiefComplaint.trim(),
      currentHistory:  form.currentHistory.trim() || undefined,
      allergies:       form.allergies.trim() || undefined,
      medications:     form.medicationsUse.trim() || undefined,
      vitalSigns:      Object.keys(form.vitalSigns).length > 0 ? form.vitalSigns : undefined,
      physicalExam:    form.physicalExam.trim() || undefined,
      diagnosis:       form.diagnosis.trim(),
      cid10:           form.cid10.trim() || undefined,
      treatmentPlan:   form.treatmentPlan.trim() || undefined,
      examRequests:    form.examRequests.trim() || undefined,
      returnDate:      form.returnDate || undefined,
      observations:    form.observations.trim() || undefined,
      status:          "finalized",
      createdAt:       nowIso,
      updatedBy:       currentUser.name,
    }

    let prescription: Omit<Prescription, "id"> | undefined = undefined
    const filledMedications = form.medications.filter((m) =>
      [m.name, m.concentration, m.posology, m.quantity, m.duration].some((field) => field.trim()),
    )
    if (filledMedications.length > 0) {
      prescription = {
        patientId:       appointment.patientId,
        patientName:     appointment.patientName,
        patientDob:      patient?.dob,
        doctorId:        currentUser.id,
        doctorName:      currentUser.name,
        doctorCrm:       currentUser.crm,
        doctorSpecialty: currentUser.specialty,
        date:            today,
        type:            form.prescriptionType,
        medications:     filledMedications,
        cid10:           form.cid10.trim() || undefined,
        observations:    form.prescriptionNotes.trim() || undefined,
        status:          "emitted",
      }
    }

    const financialRecord: Omit<FinancialRecord, "id"> = {
      patientId:       appointment.patientId,
      patientName:     appointment.patientName,
      appointmentId:   appointment.id,
      value:           totals.value,
      discount:        totals.discount > 0 ? totals.discount : undefined,
      paymentMethod:   form.paymentMethod,
      healthInsurance: form.healthInsurance.trim() || undefined,
      dueDate:         form.dueDate || today,
      status:          form.paymentStatus,
      observations:    form.billingNotes.trim() || undefined,
    }

    setSubmitting(true)
    setError(null)
    try {
      await onComplete({
        appointmentId: appointment.id,
        medicalRecord,
        prescription,
        financialRecord,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir o atendimento.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen || !appointment) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => undefined : onClose}
      title="Atender paciente"
      subtitle={`Consulta de ${appointment.date} às ${appointment.time}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button variant="primary" onClick={handleComplete} disabled={submitting}>
            {submitting ? "Concluindo…" : "Concluir atendimento"}
          </Button>
        </>
      }
    >
      <div className={styles.summaryHeader}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Avatar name={appointment.patientName} size="md" />
          <div>
            <p className={styles.patientName}>{appointment.patientName}</p>
            <p className={styles.patientMeta}>{buildPatientInfo(patient ?? null)}</p>
          </div>
        </div>
        <div className={styles.patientMeta} style={{ textAlign: "right" }}>
          Profissional<br />
          <strong style={{ color: "var(--foreground)" }}>{currentUser.name}</strong>
        </div>
      </div>

      <div role="tablist" className={styles.tabs}>
        {([
          { id: "record",       label: "Atendimento" },
          { id: "prescription", label: `Receita${form.medications.length ? ` (${form.medications.length})` : ""}` },
          { id: "billing",      label: "Cobrança" },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            onClick={() => setTab(t.id)}
            className={[styles.tab, tab === t.id ? styles.tabActive : ""].join(" ")}
            aria-selected={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "record" && (
        <div className={styles.grid2}>
          <div className={styles.full}>
            <label className={styles.label}>Queixa principal *</label>
            <textarea className={styles.textarea} rows={2}
              value={form.chiefComplaint}
              onChange={(e) => setField("chiefComplaint", e.target.value)}
              placeholder="Motivo da consulta relatado pelo paciente." />
          </div>

          <div className={styles.full}>
            <label className={styles.label}>História da doença atual</label>
            <textarea className={styles.textarea} rows={2}
              value={form.currentHistory}
              onChange={(e) => setField("currentHistory", e.target.value)}
              placeholder="Início, evolução, fatores associados." />
          </div>

          <div>
            <label className={styles.label}>Alergias relevantes</label>
            <input className={styles.input}
              value={form.allergies}
              onChange={(e) => setField("allergies", e.target.value)}
              placeholder="Ex.: penicilina, AINE." />
          </div>
          <div>
            <label className={styles.label}>Medicamentos em uso</label>
            <input className={styles.input}
              value={form.medicationsUse}
              onChange={(e) => setField("medicationsUse", e.target.value)}
              placeholder="Lista resumida." />
          </div>

          <p className={`${styles.full} ${styles.sectionTitle}`}>Sinais vitais</p>
          <div className={`${styles.full} ${styles.grid3}`}>
            <div>
              <label className={styles.label}>PA (mmHg)</label>
              <input className={styles.input}
                value={form.vitalSigns.bloodPressure ?? ""}
                onChange={(e) => setVital("bloodPressure", e.target.value)}
                placeholder="120x80" />
            </div>
            <div>
              <label className={styles.label}>FC (bpm)</label>
              <input className={styles.input} inputMode="numeric"
                value={form.vitalSigns.heartRate?.toString() ?? ""}
                onChange={(e) => setVital("heartRate", e.target.value ? Number(e.target.value) : undefined)} />
            </div>
            <div>
              <label className={styles.label}>Temp. (°C)</label>
              <input className={styles.input} inputMode="decimal"
                value={form.vitalSigns.temperature?.toString() ?? ""}
                onChange={(e) => setVital("temperature", e.target.value ? Number(e.target.value) : undefined)} />
            </div>
            <div>
              <label className={styles.label}>Peso (kg)</label>
              <input className={styles.input} inputMode="decimal"
                value={form.vitalSigns.weight?.toString() ?? ""}
                onChange={(e) => setVital("weight", e.target.value ? Number(e.target.value) : undefined)} />
            </div>
            <div>
              <label className={styles.label}>Altura (cm)</label>
              <input className={styles.input} inputMode="numeric"
                value={form.vitalSigns.height?.toString() ?? ""}
                onChange={(e) => setVital("height", e.target.value ? Number(e.target.value) : undefined)} />
            </div>
            <div>
              <label className={styles.label}>SpO₂ (%)</label>
              <input className={styles.input} inputMode="numeric"
                value={form.vitalSigns.oxygenSaturation?.toString() ?? ""}
                onChange={(e) => setVital("oxygenSaturation", e.target.value ? Number(e.target.value) : undefined)} />
            </div>
          </div>

          <div className={styles.full}>
            <label className={styles.label}>Exame físico</label>
            <textarea className={styles.textarea} rows={2}
              value={form.physicalExam}
              onChange={(e) => setField("physicalExam", e.target.value)} />
          </div>

          <div className={styles.full}>
            <label className={styles.label}>Diagnóstico *</label>
            <textarea className={styles.textarea} rows={2}
              value={form.diagnosis}
              onChange={(e) => setField("diagnosis", e.target.value)} />
          </div>

          <div>
            <label className={styles.label}>CID-10</label>
            <input className={styles.input}
              value={form.cid10}
              onChange={(e) => {
                const normalized = normalizeCid10(e.target.value).slice(0, 8)
                setField("cid10", normalized)
                setCidError(validateCid10(normalized))
              }}
              placeholder="Ex.: I10, E11.9"
              style={cidError ? { borderColor: "var(--destructive, #ef4444)" } : undefined} />
            {cidError && (
              <p style={{ fontSize: 11, color: "var(--destructive, #ef4444)", marginTop: 2 }}>{cidError}</p>
            )}
          </div>
          <div>
            <label className={styles.label}>Data de retorno</label>
            <input type="date" className={styles.input}
              value={form.returnDate}
              onChange={(e) => setField("returnDate", e.target.value)} />
          </div>

          <div className={styles.full}>
            <label className={styles.label}>Conduta / plano terapêutico</label>
            <textarea className={styles.textarea} rows={2}
              value={form.treatmentPlan}
              onChange={(e) => setField("treatmentPlan", e.target.value)} />
          </div>

          <div className={styles.full}>
            <label className={styles.label}>Exames solicitados</label>
            <textarea className={styles.textarea} rows={2}
              value={form.examRequests}
              onChange={(e) => setField("examRequests", e.target.value)} />
          </div>

          <div className={styles.full}>
            <label className={styles.label}>Observações do atendimento</label>
            <textarea className={styles.textarea} rows={2}
              value={form.observations}
              onChange={(e) => setField("observations", e.target.value)} />
          </div>
        </div>
      )}

      {tab === "prescription" && (
        <div>
          <div className={styles.grid2}>
            <div>
              <label className={styles.label}>Tipo de receita</label>
              <select className={styles.select}
                value={form.prescriptionType}
                onChange={(e) => setField("prescriptionType", e.target.value as PrescriptionType)}>
                {PRESCRIPTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ alignSelf: "end" }}>
              <Button size="sm" variant="outline" onClick={addMedication}>+ Adicionar medicamento</Button>
            </div>
          </div>

          <p className={styles.sectionTitle}>Medicamentos</p>
          {form.medications.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: 0 }}>
              Receita opcional. Adicione medicamentos se for prescrever no atendimento.
            </p>
          ) : (
            <div className={styles.medList}>
              {form.medications.map((med, idx) => (
                <div key={med.id} className={styles.medCard}>
                  <div className={styles.medHeader}>
                    <span className={styles.medTitle}>Medicamento {idx + 1}</span>
                    <button type="button" className={styles.removeBtn} onClick={() => removeMedication(med.id)}>
                      Remover
                    </button>
                  </div>
                  <div className={styles.grid3}>
                    <div>
                      <label className={styles.label}>Nome</label>
                      <input className={styles.input} value={med.name}
                        onChange={(e) => updateMedication(med.id, "name", e.target.value)}
                        placeholder="Ex.: Losartana" />
                    </div>
                    <div>
                      <label className={styles.label}>Concentração</label>
                      <input className={styles.input} value={med.concentration}
                        onChange={(e) => updateMedication(med.id, "concentration", e.target.value)}
                        placeholder="50 mg" />
                    </div>
                    <div>
                      <label className={styles.label}>Forma</label>
                      <input className={styles.input} value={med.form}
                        onChange={(e) => updateMedication(med.id, "form", e.target.value)}
                        placeholder="Comprimido" />
                    </div>
                    <div>
                      <label className={styles.label}>Quantidade</label>
                      <input className={styles.input} value={med.quantity}
                        onChange={(e) => updateMedication(med.id, "quantity", e.target.value)}
                        placeholder="30 unidades" />
                    </div>
                    <div>
                      <label className={styles.label}>Posologia</label>
                      <input className={styles.input} value={med.posology}
                        onChange={(e) => updateMedication(med.id, "posology", e.target.value)}
                        placeholder="1 cp, 1x/dia" />
                    </div>
                    <div>
                      <label className={styles.label}>Duração</label>
                      <input className={styles.input} value={med.duration}
                        onChange={(e) => updateMedication(med.id, "duration", e.target.value)}
                        placeholder="30 dias" />
                    </div>
                    <div className={styles.full}>
                      <label className={styles.label}>Instruções</label>
                      <textarea className={styles.textarea} rows={2}
                        value={med.instructions ?? ""}
                        onChange={(e) => updateMedication(med.id, "instructions", e.target.value)}
                        placeholder="Tomar pela manhã, com ou sem alimentos." />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className={styles.full} style={{ marginTop: 12 }}>
            <label className={styles.label}>Observações da receita</label>
            <textarea className={styles.textarea} rows={2}
              value={form.prescriptionNotes}
              onChange={(e) => setField("prescriptionNotes", e.target.value)} />
          </div>
        </div>
      )}

      {tab === "billing" && (
        <div className={styles.grid2}>
          <div>
            <label className={styles.label}>Valor (R$) *</label>
            <input className={styles.input} inputMode="decimal" value={form.value}
              onChange={(e) => setField("value", e.target.value)}
              placeholder="0,00" />
          </div>
          <div>
            <label className={styles.label}>Desconto (R$)</label>
            <input className={styles.input} inputMode="decimal" value={form.discount}
              onChange={(e) => setField("discount", e.target.value)}
              placeholder="0,00" />
          </div>

          <div>
            <label className={styles.label}>Método de pagamento</label>
            <select className={styles.select}
              value={form.paymentMethod}
              onChange={(e) => setField("paymentMethod", e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>)}
            </select>
          </div>
          <div>
            <label className={styles.label}>Status do pagamento</label>
            <select className={styles.select}
              value={form.paymentStatus}
              onChange={(e) => setField("paymentStatus", e.target.value as PaymentStatus)}>
              {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}
            </select>
          </div>

          <div>
            <label className={styles.label}>Vencimento</label>
            <input type="date" className={styles.input}
              value={form.dueDate}
              onChange={(e) => setField("dueDate", e.target.value)} />
          </div>
          <div>
            <label className={styles.label}>Convênio</label>
            <input className={styles.input}
              value={form.healthInsurance}
              onChange={(e) => setField("healthInsurance", e.target.value)}
              placeholder="Particular, Amil, Unimed..." />
          </div>

          <div className={styles.full}>
            <label className={styles.label}>Observações da cobrança</label>
            <textarea className={styles.textarea} rows={2}
              value={form.billingNotes}
              onChange={(e) => setField("billingNotes", e.target.value)} />
          </div>

          <div className={`${styles.full} ${styles.financeSummary}`}>
            <span>Resumo</span>
            <span className={styles.financeTotal}>
              R$ {totals.total.toFixed(2).replace(".", ",")}
            </span>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              {totals.discount > 0 ? `Valor R$ ${totals.value.toFixed(2)} − Desconto R$ ${totals.discount.toFixed(2)}` : `Valor cheio`}
              {" · "}{PAYMENT_METHOD_LABEL[form.paymentMethod]} · {PAYMENT_STATUS_LABEL[form.paymentStatus]}
            </span>
          </div>
        </div>
      )}

      <div className={styles.checklistBox}>
        Ao concluir, o sistema vai:
        <ul>
          <li>Gravar o prontuário (queixa, diagnóstico, conduta).</li>
          <li>Emitir a receita se você adicionou medicamentos.</li>
          <li>Lançar o atendimento no financeiro.</li>
          <li>Marcar a consulta como <strong>concluída</strong>.</li>
        </ul>
      </div>

      {error && <p className={styles.errorBox}>{error}</p>}
    </Modal>
  )
}

import { useState } from "react"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Button } from "../../components/ui/Button/Button"
import { Input } from "../../components/ui/Input/Input"
import { Select } from "../../components/ui/Select/Select"
import { Section } from "../../components/ui/Section/Section"
import type { PageId, Patient } from "../../types"
import styles from "./Registration.module.css"

interface RegistrationProps {
  patients: Patient[]
  editingPatient?: Patient | null
  onAddPatient: (p: Patient) => void
  onUpdatePatient: (p: Patient) => void
  onNavigate: (page: PageId) => void
}

const TOTAL_STEPS = 3
const STEP_LABELS = ["Dados pessoais", "Documentos", "Contato e social"]

type FormState = {
  // Step 1
  name: string
  gender: string
  dob: string
  maritalStatus: string
  occupation: string
  // Step 2
  docType: string
  cpf: string
  healthInsurance: string
  // Step 3
  phone: string
  email: string
  preferredChannel: string
  observations: string
}

const EMPTY_FORM: FormState = {
  name: "", gender: "", dob: "", maritalStatus: "", occupation: "",
  docType: "CPF", cpf: "", healthInsurance: "",
  phone: "", email: "", preferredChannel: "", observations: "",
}

function patientToForm(p: Patient): FormState {
  return {
    name:             p.name ?? "",
    gender:           p.gender ?? "",
    dob:              p.dob ?? "",
    maritalStatus:    p.maritalStatus ?? "",
    occupation:       p.occupation ?? "",
    docType:          "CPF",
    cpf:              p.cpf ?? "",
    healthInsurance:  p.healthInsurance ?? "",
    phone:            p.phone ?? "",
    email:            p.email ?? "",
    preferredChannel: p.preferredChannel ?? "",
    observations:     p.observations ?? "",
  }
}

export function Registration({ patients, editingPatient, onAddPatient, onUpdatePatient, onNavigate }: RegistrationProps) {
  const isEditing = !!editingPatient
  const [step, setStep]     = useState(1)
  const [form, setForm]     = useState<FormState>(editingPatient ? patientToForm(editingPatient) : EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saved, setSaved]   = useState(false)

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  function validateStep(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {}

    if (step === 1) {
      if (!form.name.trim())   e.name   = "Nome obrigatório"
      if (!form.gender)        e.gender = "Sexo obrigatório"
      if (!form.dob)           e.dob    = "Data de nascimento obrigatória"
    }

    if (step === 2) {
      if (!form.cpf.trim()) {
        e.cpf = "CPF obrigatório"
      } else if (patients.some((p) => p.cpf === form.cpf && p.id !== editingPatient?.id)) {
        e.cpf = "CPF já cadastrado no sistema"
      }
    }

    if (step === 3) {
      if (!form.phone.trim()) e.phone = "Telefone obrigatório"
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleNext() {
    if (!validateStep()) return
    if (step < TOTAL_STEPS) { setStep((s) => s + 1); return }

    // Save patient
    const newPatient: Patient = {
      ...(editingPatient ?? {}),
      id:             editingPatient?.id ?? Date.now(),
      name:           form.name.trim(),
      cpf:            form.cpf.trim(),
      gender:         form.gender as Patient["gender"],
      dob:            form.dob,
      maritalStatus:  form.maritalStatus as Patient["maritalStatus"] | undefined,
      occupation:     form.occupation || undefined,
      healthInsurance:form.healthInsurance || undefined,
      phone:          form.phone.trim(),
      email:          form.email || undefined,
      preferredChannel: form.preferredChannel as Patient["preferredChannel"] | undefined,
      observations:   form.observations || undefined,
      status:         "Active",
      createdAt:      new Date().toISOString().split("T")[0],
      updatedAt:      new Date().toISOString().split("T")[0],
      updatedBy:      "Dr. Admin",
    }

    if (isEditing) {
      onUpdatePatient(newPatient)
    } else {
      onAddPatient(newPatient)
    }
    setSaved(true)
  }

  if (saved) {
    return (
      <div>
        <Topbar title={isEditing ? "Editar Paciente" : "Cadastro de Paciente"} subtitle="Dados atualizados com sucesso" />
        <Card className={styles.formCard}>
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>
              ✓
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)", marginBottom: 8 }}>
              {isEditing ? "Dados atualizados com sucesso!" : "Paciente cadastrado com sucesso!"}
            </p>
            <p style={{ fontSize: 14, color: "var(--muted-foreground)", marginBottom: 24 }}>
              {isEditing
                ? `Os dados de ${form.name} foram atualizados.`
                : `${form.name} foi adicionado à lista de pacientes.`}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Button variant="ghost" onClick={() => { setForm(EMPTY_FORM); setStep(1); setSaved(false) }}>
                Cadastrar outro
              </Button>
              <Button onClick={() => onNavigate("patients")}>Ver pacientes</Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Topbar
        title={isEditing ? "Editar Paciente" : "Cadastro de Paciente"}
        subtitle={isEditing ? `Editando dados de ${editingPatient.name}` : "Preencha os dados para criar o prontuário"}
        action={<Button variant="ghost" onClick={() => onNavigate("patients")}>Cancelar</Button>}
      />

      <Card className={styles.formCard}>
        {/* Stepper */}
        <div className={styles.stepper}>
          {STEP_LABELS.map((label, i) => {
            const n      = i + 1
            const done   = n < step
            const active = n === step
            return (
              <div key={label} className={`${styles.step} ${i < 2 ? styles.flex1 : ""}`}>
                <div className={styles.stepInner}>
                  <div className={`${styles.stepCircle} ${done || active ? styles.stepCircleActive : styles.stepCircleInactive}`}>
                    {done ? "✓" : n}
                  </div>
                  <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : styles.stepLabelInactive}`}>
                    {label}
                  </span>
                </div>
                {i < 2 && <div className={`${styles.stepLine} ${done ? styles.stepLineDone : styles.stepLineUndone}`} />}
              </div>
            )
          })}
        </div>

        {/* Step 1 — Dados pessoais */}
        {step === 1 && (
          <>
            <Section title="Identificação">
              <div className={`${styles.grid2} ${styles.marginTop}`}>
                <Input label="Nome completo" required placeholder="Nome como no documento"
                  value={form.name} onChange={(e) => set("name", e.target.value)}
                  error={errors.name} className={styles.colSpan2} />
                <Select label="Sexo" required
                  options={["Masculino", "Feminino", "Outro"]}
                  value={form.gender} onChange={(e) => set("gender", e.target.value)} />
                <Input label="Data de nascimento" type="date" required
                  value={form.dob} onChange={(e) => set("dob", e.target.value)}
                  error={errors.dob} />
              </div>
              <div className={`${styles.grid2} ${styles.marginTop}`}>
                <Select label="Estado civil"
                  options={["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União estável"]}
                  value={form.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)} />
                <Input label="Profissão" placeholder="Ex: Professor"
                  value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
              </div>
            </Section>
          </>
        )}

        {/* Step 2 — Documentos */}
        {step === 2 && (
          <>
            <Section title="Documento principal">
              <div className={styles.grid3}>
                <Select label="Tipo de documento"
                  options={["CPF", "RG", "CNH", "Passaporte"]}
                  value={form.docType} onChange={(e) => set("docType", e.target.value)} />
                <Input label="Número do documento" required
                  placeholder={form.docType === "CPF" ? "000.000.000-00" : "Número"}
                  value={form.cpf} onChange={(e) => set("cpf", e.target.value)}
                  error={errors.cpf} />
              </div>
              <div className={`${styles.docBox} ${styles.marginTop}`}>
                <p className={styles.docBoxTitle}>Convênio</p>
                <div className={styles.docBoxGrid}>
                  <Select label="Convênio"
                    options={["SUS", "Unimed", "Bradesco Saúde", "Amil", "Particular"]}
                    value={form.healthInsurance} onChange={(e) => set("healthInsurance", e.target.value)} />
                </div>
              </div>
            </Section>
          </>
        )}

        {/* Step 3 — Contato */}
        {step === 3 && (
          <>
            <Section title="Contatos">
              <div className={styles.grid3}>
                <Input label="Celular" required placeholder="(00) 00000-0000"
                  value={form.phone} onChange={(e) => set("phone", e.target.value)}
                  error={errors.phone} />
                <Input label="E-mail" type="email" placeholder="exemplo@email.com"
                  value={form.email} onChange={(e) => set("email", e.target.value)} />
                <Select label="Canal preferido"
                  options={["WhatsApp", "E-mail", "SMS", "Telefone"]}
                  value={form.preferredChannel} onChange={(e) => set("preferredChannel", e.target.value)} />
              </div>
            </Section>
            <Section title="Observações gerais">
              <textarea
                placeholder="Informações relevantes, alergias, observações..."
                rows={3}
                value={form.observations}
                onChange={(e) => set("observations", e.target.value)}
                className={styles.textarea}
              />
            </Section>
          </>
        )}

        {/* Footer */}
        <div className={styles.formFooter}>
          <Button variant="ghost" onClick={() => step > 1 ? setStep((s) => s - 1) : onNavigate("patients")}>
            {step > 1 ? "← Anterior" : "Cancelar"}
          </Button>
          <div className={styles.formFooterRight}>
            <span className={styles.stepCount}>Etapa {step} de {TOTAL_STEPS}</span>
            <Button onClick={handleNext}>
              {step < TOTAL_STEPS ? "Próximo →" : "Salvar paciente"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

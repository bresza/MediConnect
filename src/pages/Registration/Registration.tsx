import { useState, useRef, useEffect } from "react"
import { Topbar }   from "../../components/layout/Topbar/Topbar"
import { Card }     from "../../components/ui/Card/Card"
import { Button }   from "../../components/ui/Button/Button"
import { Input }    from "../../components/ui/Input/Input"
import { Select }   from "../../components/ui/Select/Select"
import { Section }  from "../../components/ui/Section/Section"
import {
  formatCepBR, formatCpfBR, formatPhoneBR,
  hasAtLeastTwoNames, isValidCpf, isValidEmail, onlyDigits,
} from "../../utils"
import type { PageId, Patient } from "../../types"
import styles from "./Registration.module.css"

interface RegistrationProps {
  patients:        Patient[]
  editingPatient?: Patient | null
  onAddPatient:    (p: Omit<Patient, "id">) => Promise<Patient>
  onAddPatientWithPassword?: (p: Omit<Patient, "id">, password: string) => Promise<Patient>
  onCreatePatientAccess?: (p: Patient, password: string) => Promise<Patient>
  onUpdatePatient: (p: Patient) => Promise<void>
  onNavigate:      (page: PageId) => void
  isSecretary?:    boolean   // secretária vê apenas steps 1-4 (sem dados clínicos)
}

// ─── Steps ────────────────────────────────────────────────────────
const STEP_LABELS = [
  "Identificação",
  "Documentos",
  "Endereço",
  "Contato e Família",
  "Saúde e Clínica",
]

// ─── Form state ───────────────────────────────────────────────────
interface FormState {
  // Step 1 — Identificação
  name:             string
  socialName:       string
  gender:           string
  dob:              string
  birthplace:       string
  nationality:      string
  maritalStatus:    string
  ethnicity:        string
  occupation:       string
  religion:         string
  education:        string
  isVip:            boolean
  photoUrl:         string

  // Step 2 — Documentos
  cpf:                    string
  rg:                     string
  rgIssuer:               string
  rgState:                string
  rgDate:                 string
  cnh:                    string
  passport:               string
  healthInsurance:        string
  healthInsuranceNumber:  string
  healthInsurancePlan:    string
  healthInsuranceExpiry:  string
  isNewbornOnInsurance:   boolean
  legacyCode:             string

  // Step 3 — Endereço
  zipCode:       string
  street:        string
  addressNumber: string
  complement:    string
  neighborhood:  string
  city:          string
  state:         string
  reference:     string

  // Step 4 — Contato e Família
  phone:            string
  landline:         string
  alternativePhone: string
  email:            string
  preferredChannel: string
  communicationFrequency: string
  optIn:            boolean
  motherName:       string
  motherOccupation: string
  fatherName:       string
  fatherOccupation: string
  guardianName:     string
  guardianCpf:      string
  spouseName:       string
  emergencyName:    string
  emergencyRelation: string
  emergencyPhone:   string
  createPortalAccess: boolean
  portalPassword:   string
  portalConfirmPassword: string

  // Step 5 — Saúde e Clínica
  bloodType:        string
  allergies:        string
  chronicDiseases:  string
  currentMeds:      string
  previousSurgeries: string
  familyHistory:    string
  smokingStatus:    string
  alcoholUse:       string
  physicalActivity: string
  observations:     string
}

const EMPTY: FormState = {
  name:"",socialName:"",gender:"",dob:"",birthplace:"",nationality:"Brasil",
  maritalStatus:"",ethnicity:"",occupation:"",religion:"",education:"",
  isVip:false,photoUrl:"",
  cpf:"",rg:"",rgIssuer:"",rgState:"",rgDate:"",cnh:"",passport:"",
  healthInsurance:"",healthInsuranceNumber:"",healthInsurancePlan:"",
  healthInsuranceExpiry:"",isNewbornOnInsurance:false,legacyCode:"",
  zipCode:"",street:"",addressNumber:"",complement:"",neighborhood:"",
  city:"",state:"",reference:"",
  phone:"",landline:"",alternativePhone:"",email:"",preferredChannel:"",
  communicationFrequency:"",optIn:false,
  motherName:"",motherOccupation:"",fatherName:"",fatherOccupation:"",
  guardianName:"",guardianCpf:"",spouseName:"",
  emergencyName:"",emergencyRelation:"",emergencyPhone:"",
  createPortalAccess:false,portalPassword:"",portalConfirmPassword:"",
  bloodType:"",allergies:"",chronicDiseases:"",currentMeds:"",
  previousSurgeries:"",familyHistory:"",smokingStatus:"",alcoholUse:"",
  physicalActivity:"",observations:"",
}

function toForm(p: Patient): FormState {
  const maritalMap: Record<string, string> = {
    Single: "Solteiro(a)",
    Married: "Casado(a)",
    Divorced: "Divorciado(a)",
    Widowed: "Viúvo(a)",
    StableUnion: "União estável",
  }

  const ethnicityMap: Record<string, string> = {
    Black: "Preta",
    Mixed: "Parda",
    White: "Branca",
    Asian: "Amarela",
    Indigenous: "Indígena",
  }

  return {
    ...EMPTY,

    // ─── STEP 1 — Identificação ─────────────────────────
    name: p.name ?? "",
    socialName: p.socialName ?? "",

    gender:
      p.gender === "Male"
        ? "Masculino"
        : p.gender === "Female"
        ? "Feminino"
        : p.gender === "Other"
        ? "Outro"
        : "",

    dob: p.dob ?? "",
    birthplace: p.birthplace ?? "",
    nationality: p.nationality ?? "Brasil",

    maritalStatus: p.maritalStatus
      ? maritalMap[p.maritalStatus] ?? ""
      : "",

    ethnicity: p.ethnicity
      ? ethnicityMap[p.ethnicity] ?? ""
      : "",

    occupation: p.occupation ?? "",
    religion: "",
    education: "",
    isVip: p.isVip ?? false,
    photoUrl: p.photoUrl ?? "",

    // ─── STEP 2 — Documentos ────────────────────────────
    cpf: formatCpfBR(p.cpf ?? ""),
    rg: p.rg ?? "",
    rgIssuer: "",
    rgState: "",
    rgDate: "",
    cnh: "",
    passport: "",

    healthInsurance: p.healthInsurance ?? "",
    healthInsuranceNumber: p.healthInsuranceNumber ?? "",
    healthInsurancePlan: "",
    healthInsuranceExpiry: "",
    isNewbornOnInsurance: false,
    legacyCode: "",

    // ─── STEP 3 — Endereço ──────────────────────────────
    zipCode: formatCepBR(p.address?.zipCode ?? ""),
    street: p.address?.street ?? "",
    addressNumber: p.address?.number ?? "",
    complement: p.address?.complement ?? "",
    neighborhood: p.address?.neighborhood ?? "",
    city: p.address?.city ?? "",
    state: p.address?.state ?? "",
    reference: p.address?.reference ?? "",

    // ─── STEP 4 — Contato e Família ─────────────────────
    phone: formatPhoneBR(p.phone ?? ""),
    landline: formatPhoneBR(p.landline ?? ""),
    alternativePhone: formatPhoneBR(p.alternativePhone ?? ""),
    email: p.email ?? "",

    preferredChannel: fromChannel(p.preferredChannel),
    communicationFrequency: fromFrequency(p.communicationFrequency),
    optIn: p.optIn ?? false,

    motherName: p.motherName ?? "",
    motherOccupation: p.motherOccupation ?? "",
    fatherName: p.fatherName ?? "",
    fatherOccupation: p.fatherOccupation ?? "",
    guardianName: p.guardianName ?? "",
    guardianCpf: formatCpfBR(p.guardianCpf ?? ""),
    spouseName: p.spouseName ?? "",

    emergencyName: p.emergencyContact?.name ?? "",
    emergencyRelation: p.emergencyContact?.relationship ?? "",
    emergencyPhone: formatPhoneBR(p.emergencyContact?.phone ?? ""),
    createPortalAccess: false,
    portalPassword: "",
    portalConfirmPassword: "",

    // ─── STEP 5 — Saúde e Clínica ───────────────────────
    bloodType: "",
    allergies: "",
    chronicDiseases: "",
    currentMeds: "",
    previousSurgeries: "",
    familyHistory: "",
    smokingStatus: "",
    alcoholUse: "",
    physicalActivity: "",
    observations: p.observations ?? "",
  }
}

function toGender(v: string): Patient["gender"] | undefined {
  if (v === "Masculino") return "Male"
  if (v === "Feminino")  return "Female"
  if (v === "Outro") return "Other"
  return undefined
}
function toMarital(v: string): Patient["maritalStatus"] | undefined {
  const m: Record<string, Patient["maritalStatus"]> = {
    "Solteiro(a)":"Single","Casado(a)":"Married","Divorciado(a)":"Divorced",
    "Viúvo(a)":"Widowed","União estável":"StableUnion",
  }
  return m[v]
}
function toEthnicity(v: string): Patient["ethnicity"] | undefined {
  const m: Record<string, Patient["ethnicity"]> = {
    Preta:"Black",Parda:"Mixed",Branca:"White",Amarela:"Asian",Indígena:"Indigenous",
  }
  return m[v]
}
function toChannel(v: string): Patient["preferredChannel"] | undefined {
  const m: Record<string, Patient["preferredChannel"]> = {
    WhatsApp: "WhatsApp",
    Email: "Email",
    SMS: "SMS",
    Telefone: "Phone",
    Phone: "Phone",
  }
  return m[v]
}
function fromChannel(v?: Patient["preferredChannel"]): string {
  if (v === "Phone") return "Telefone"
  return v ?? ""
}
function toFrequency(v: string): Patient["communicationFrequency"] | undefined {
  const m: Record<string, Patient["communicationFrequency"]> = {
    "Somente essencial": "EssentialOnly",
    "Lembretes e confirmações": "RemindersAndConfirmations",
    Todos: "All",
    EssentialOnly: "EssentialOnly",
    RemindersAndConfirmations: "RemindersAndConfirmations",
    All: "All",
  }
  return m[v]
}
function fromFrequency(v?: Patient["communicationFrequency"]): string {
  const m: Record<string, string> = {
    EssentialOnly: "Somente essencial",
    RemindersAndConfirmations: "Lembretes e confirmações",
    All: "Todos",
  }
  return v ? (m[v] ?? v) : ""
}

// ─── Options ──────────────────────────────────────────────────────
const GENDERS        = ["Masculino","Feminino","Outro","Não informado"]
const MARITAL        = ["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União estável","Separado(a)"]
const ETHNICITIES    = ["Branca","Preta","Parda","Amarela","Indígena","Não declarado"]
const EDUCATIONS     = ["Não alfabetizado","Fundamental incompleto","Fundamental completo","Médio incompleto","Médio completo","Superior incompleto","Superior completo","Pós-graduação"]
const BLOOD_TYPES    = ["A+","A-","B+","B-","AB+","AB-","O+","O-","Não sabe"]
const SMOKING        = ["Nunca fumou","Ex-fumante","Fumante"]
const ALCOHOL        = ["Não consome","Consome ocasionalmente","Consome regularmente","Ex-alcoolista"]
const PHYSICAL       = ["Sedentário","Ativo (1-2x/semana)","Moderado (3-4x/semana)","Muito ativo (5+x/semana)"]
const CHANNELS       = ["WhatsApp","Email","SMS","Telefone"]
const FREQUENCIES    = ["Somente essencial","Lembretes e confirmações","Todos"]
const HEALTH_INS     = ["Nenhum (Particular)","SUS","Unimed","Bradesco Saúde","Amil","SulAmérica","Notre Dame","Hapvida","Assim Saúde","Porto Seguro","Outro"]
const BR_STATES      = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]
const RELATIONS      = ["Cônjuge","Pai","Mãe","Filho(a)","Irmão/Irmã","Avô/Avó","Amigo(a)","Outro"]
const RELIGIONS      = ["Católico","Evangélico","Espírita","Budista","Sem religião","Outro"]
const TODAY = new Date().toISOString().slice(0, 10)

// ─── Component ────────────────────────────────────────────────────
export function Registration({
  patients,
  editingPatient,
  onAddPatient,
  onAddPatientWithPassword,
  onCreatePatientAccess,
  onUpdatePatient,
  onNavigate,
  isSecretary = false,
}: RegistrationProps) {
  const isEditing   = !!editingPatient
  const totalSteps = isSecretary ? 4 : STEP_LABELS.length
  const [step, setStep]       = useState(1)
  const [form, setForm]       = useState<FormState>(editingPatient ? toForm(editingPatient) : EMPTY)
  const [errors, setErrors]   = useState<Partial<Record<keyof FormState, string>>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved]     = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reinicializa quando editingPatient muda
  useEffect(() => {
    setForm(editingPatient ? toForm(editingPatient) : EMPTY)
    setStep(1); setSaved(false); setErrors({})
  }, [editingPatient])

  function set(field: keyof FormState, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
    setSaveError(null)
  }

  // CEP auto-fill
  async function handleCepBlur() {
    const cep = form.zipCode.replace(/\D/g, "")
    if (cep.length !== 8) return
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (!data.erro) {
        set("street",       data.logradouro ?? "")
        set("neighborhood", data.bairro ?? "")
        set("city",         data.localidade ?? "")
        set("state",        data.uf ?? "")
      }
    } catch { /* silencia */ }
  }

  function validationForStep(targetStep = step): Partial<Record<keyof FormState, string>> {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (targetStep === 1) {
      if (!form.name.trim()) e.name = "Nome completo é obrigatório"
      else if (!hasAtLeastTwoNames(form.name)) e.name = "Informe pelo menos dois nomes"
      if (!form.gender)      e.gender = "Sexo é obrigatório"
      if (!form.dob)         e.dob    = "Data de nascimento é obrigatória"
      else if (form.dob > TODAY) e.dob = "Data de nascimento deve estar no passado"
    }
    if (targetStep === 2) {
      const cpf = onlyDigits(form.cpf)
      if (!cpf)  e.cpf = "CPF é obrigatório"
      else if (cpf.length !== 11) e.cpf = "CPF deve ter 11 dígitos"
      else if (!isValidCpf(cpf)) e.cpf = "CPF inválido"
      else if (patients.some((p) => onlyDigits(p.cpf) === cpf && p.id !== editingPatient?.id))
        e.cpf = "CPF já cadastrado no sistema"
    }
    if (targetStep === 4) {
      const phone = onlyDigits(form.phone)
      const email = form.email.trim()
      if (!phone)        e.phone = "Celular é obrigatório"
      else if (phone.length !== 11) e.phone = "Celular deve estar no formato (00)-00000-0000"
      if (!email) e.email = "E-mail é obrigatório"
      else if (!isValidEmail(email)) e.email = "E-mail inválido"
      if (form.emergencyPhone && !form.emergencyName)
        e.emergencyName = "Informe o nome do contato de emergência"
      if (form.createPortalAccess) {
        if (!form.portalPassword) e.portalPassword = "Senha obrigatória"
        else if (form.portalPassword.length < 6) e.portalPassword = "Mínimo 6 caracteres"
        if (form.portalPassword !== form.portalConfirmPassword) e.portalConfirmPassword = "Senhas não coincidem"
        if (!isEditing && !onAddPatientWithPassword) e.portalPassword = "Criação de acesso indisponível"
        if (isEditing && !onCreatePatientAccess) e.portalPassword = "Criação de acesso indisponível"
      }
    }
    return e
  }

  function validateStep(targetStep = step): boolean {
    const e = validationForStep(targetStep)
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function validateRequiredSteps(): boolean {
    for (const targetStep of [1, 2, 4]) {
      const e = validationForStep(targetStep)
      if (Object.keys(e).length > 0) {
        setErrors(e)
        setStep(targetStep)
        return false
      }
    }
    setErrors({})
    return true
  }

  function buildPatientData(): Omit<Patient, "id"> {
    return {
      name:                   form.name.trim(),
      socialName:             form.socialName || undefined,
      gender:                 toGender(form.gender),
      dob:                    form.dob,
      birthplace:             form.birthplace || undefined,
      nationality:            form.nationality || undefined,
      maritalStatus:          toMarital(form.maritalStatus),
      ethnicity:              toEthnicity(form.ethnicity),
      occupation:             form.occupation || undefined,
      isVip:                  form.isVip,
      photoUrl:               isEditing
        ? form.photoUrl
        : (form.photoUrl || undefined),
      cpf:                    onlyDigits(form.cpf),
      rg:                     form.rg || undefined,
      healthInsurance:        form.healthInsurance && form.healthInsurance !== "Nenhum (Particular)" ? form.healthInsurance : undefined,
      healthInsuranceNumber:  form.healthInsuranceNumber || undefined,
      phone:                  onlyDigits(form.phone),
      landline:               onlyDigits(form.landline) || undefined,
      alternativePhone:       onlyDigits(form.alternativePhone) || undefined,
      email:                  form.email.trim(),
      preferredChannel:       toChannel(form.preferredChannel),
      communicationFrequency: toFrequency(form.communicationFrequency),
      optIn:                  form.optIn,
      motherName:             form.motherName || undefined,
      motherOccupation:       form.motherOccupation || undefined,
      fatherName:             form.fatherName || undefined,
      fatherOccupation:       form.fatherOccupation || undefined,
      guardianName:           form.guardianName || undefined,
      guardianCpf:            onlyDigits(form.guardianCpf) || undefined,
      spouseName:             form.spouseName || undefined,
      emergencyContact: form.emergencyName ? {
        name:         form.emergencyName,
        relationship: form.emergencyRelation,
        phone:        onlyDigits(form.emergencyPhone),
      } : undefined,
      address: form.street ? {
        zipCode:      form.zipCode.replace(/\D/g, ""),
        street:       form.street,
        number:       form.addressNumber,
        complement:   form.complement || undefined,
        neighborhood: form.neighborhood,
        city:         form.city,
        state:        form.state,
        reference:    form.reference || undefined,
      } : undefined,
      observations: form.observations || undefined,
      status:       "Active",
      createdAt:    editingPatient?.createdAt ?? new Date().toISOString().slice(0, 10),
      updatedAt:    new Date().toISOString().slice(0, 10),
    }
  }

  async function savePatient() {
    setIsSaving(true)
    try {
      const data = buildPatientData()
      if (isEditing && editingPatient) {
        const patient = { ...data, id: editingPatient.id }
        if (form.createPortalAccess && onCreatePatientAccess) {
          await onCreatePatientAccess(patient, form.portalPassword)
        } else {
          await onUpdatePatient(patient)
        }
      } else if (form.createPortalAccess && onAddPatientWithPassword) {
        await onAddPatientWithPassword(data, form.portalPassword)
      } else {
        await onAddPatient(data)
      }
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Não foi possível salvar o paciente.")
    } finally { setIsSaving(false) }
  }

  async function handleNext() {
    setSaveError(null)
    if (isEditing) {
      if (!validateRequiredSteps()) return
      await savePatient()
      return
    }
    if (!validateStep()) return
    if (step < totalSteps) { setStep((s) => s + 1); return }
    await savePatient()
  }

  // ── Saved screen ─────────────────────────────────────────────────
  if (saved) {
    return (
      <div>
        <Topbar title={isEditing ? "Editar Paciente" : "Cadastro de Paciente"} subtitle="Dados salvos com sucesso" />
        <Card className={styles.formCard}>
          <div style={{ textAlign:"center", padding:"48px 24px" }}>
            <div style={{ width:64,height:64,borderRadius:"50%",background:"#ecfdf5",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:32 }}>✓</div>
            <p style={{ fontSize:20,fontWeight:700,color:"var(--foreground)",marginBottom:8 }}>
              {isEditing ? "Paciente atualizado!" : "Paciente cadastrado!"}
            </p>
            <p style={{ fontSize:14,color:"var(--muted-foreground)",marginBottom:28 }}>
              {isEditing ? `Os dados de ${form.name} foram atualizados com sucesso.` : `${form.name} foi registrado no sistema.`}
            </p>
            <div style={{ display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap" }}>
              {!isEditing && (
                <Button variant="ghost" onClick={() => { setForm(EMPTY); setStep(1); setSaved(false) }}>
                  Cadastrar outro paciente
                </Button>
              )}
              <Button onClick={() => onNavigate("patients")}>Ver lista de pacientes</Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const Label = ({ text, required }: { text: string; required?: boolean }) => (
    <label style={{ fontSize:12,fontWeight:500,color:"var(--foreground)",display:"block",marginBottom:4 }}>
      {text}{required && <span style={{ color:"var(--destructive)",marginLeft:2 }}>*</span>}
    </label>
  )

  const Textarea = ({ label, field, placeholder, rows = 3 }: { label: string; field: keyof FormState; placeholder?: string; rows?: number }) => (
    <div>
      <Label text={label} />
      <textarea
        value={form[field] as string}
        onChange={(e) => set(field, e.target.value)}
        rows={rows} placeholder={placeholder}
        style={{ width:"100%",padding:"8px 12px",borderRadius:8,fontSize:13,border:"1px solid var(--border)",background:"var(--background)",color:"var(--foreground)",outline:"none",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit" }}
      />
    </div>
  )

  const CheckRow = ({ field, label }: { field: keyof FormState; label: string }) => (
    <label style={{ display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer",color:"var(--foreground)" }}>
      <input type="checkbox" checked={form[field] as boolean} onChange={(e) => set(field, e.target.checked)}
        style={{ accentColor:"var(--primary)",width:15,height:15 }} />
      {label}
    </label>
  )

  return (
    <div>
      <Topbar
        title={isEditing ? "Editar Paciente" : "Novo Cadastro de Paciente"}
        subtitle={isEditing ? `Editando: ${editingPatient?.name}` : "Ficha hospitalar completa"}
        action={<Button variant="ghost" onClick={() => onNavigate("patients")}>Cancelar</Button>}
      />

      <Card className={styles.formCard}>
        {/* Stepper */}
        <div className={styles.stepper}>
        {STEP_LABELS.slice(0, totalSteps).map((label, i) => {
            const n = i + 1; const done = n < step; const active = n === step
            return (
              <div key={label} className={`${styles.step} ${i < totalSteps - 1 ? styles.flex1 : ""}`}>
                <button
                  type="button"
                  className={`${styles.stepInner} ${isEditing ? styles.stepButton : ""}`}
                  onClick={() => isEditing && setStep(n)}
                  disabled={!isEditing}
                >
                  <div className={`${styles.stepCircle} ${done || active ? styles.stepCircleActive : styles.stepCircleInactive}`}>
                    {done ? "✓" : n}
                  </div>
                  <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : styles.stepLabelInactive}`}>{label}</span>
                </button>
                {i < totalSteps - 1 &&<div className={`${styles.stepLine} ${done ? styles.stepLineDone : styles.stepLineUndone}`} />}
              </div>
            )
          })}
        </div>

        {/* ── STEP 1 — Identificação ──────────────────────────────── */}
        {step === 1 && (
          <>
            {/* Foto */}
            <div className={styles.photoSection}>
              <div className={styles.photoContainer} onClick={() => fileInputRef.current?.click()}>
                {form.photoUrl ? (
                  <img src={form.photoUrl} alt="Foto" className={styles.photoPreview} />
                ) : (
                  <div className={styles.photoPlaceholder}>
                    <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                    </svg>
                    <span>Adicionar foto</span>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 5 * 1024 * 1024) {
                    setSaveError("A foto deve ter no maximo 5 MB.")
                    e.target.value = ""
                    return
                  }
                  setSaveError(null)
                  const reader = new FileReader()
                  reader.onload = (ev) => set("photoUrl", ev.target?.result as string)
                  reader.readAsDataURL(file)
                }} />
              </div>
              {form.photoUrl && <button className={styles.photoRemoveBtn} onClick={() => set("photoUrl","")}>Remover foto</button>}
            </div>

            <Section title="Dados pessoais">
              <div className={`${styles.grid2} ${styles.marginTop}`}>
                <Input label="Nome completo" required placeholder="Como no documento oficial"
                  value={form.name} onChange={(e) => set("name", e.target.value)}
                  error={errors.name} className={styles.colSpan2} />
                <Input label="Nome social" placeholder="Se diferente do nome civil"
                  value={form.socialName} onChange={(e) => set("socialName", e.target.value)} />
                <div>
                  <Label text="Paciente VIP / Prioritário" />
                  <CheckRow field="isVip" label="Marcar como prioritário" />
                </div>
              </div>
              <div className={`${styles.grid3} ${styles.marginTop}`}>
                <Select label="Sexo biológico" options={GENDERS}
                  value={form.gender} onChange={(e) => set("gender", e.target.value)} />
                <Input label="Data de nascimento" type="date" required max={TODAY}
                  value={form.dob} onChange={(e) => set("dob", e.target.value)} error={errors.dob} />
                <Select label="Estado civil" options={MARITAL}
                  value={form.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)} />
              </div>
              <div className={`${styles.grid3} ${styles.marginTop}`}>
                <Select label="Raça/Cor (IBGE)" options={ETHNICITIES}
                  value={form.ethnicity} onChange={(e) => set("ethnicity", e.target.value)} />
                <Input label="Profissão/Ocupação" placeholder="Ex: Professor"
                  value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
                <Select label="Escolaridade" options={EDUCATIONS}
                  value={form.education} onChange={(e) => set("education", e.target.value)} />
              </div>
              <div className={`${styles.grid3} ${styles.marginTop}`}>
                <Input label="Naturalidade (cidade)" placeholder="Ex: Aracaju"
                  value={form.birthplace} onChange={(e) => set("birthplace", e.target.value)} />
                <Input label="Nacionalidade" placeholder="Ex: Brasileira"
                  value={form.nationality} onChange={(e) => set("nationality", e.target.value)} />
                <Select label="Religião" options={RELIGIONS}
                  value={form.religion} onChange={(e) => set("religion", e.target.value)} />
              </div>
            </Section>
          </>
        )}

        {/* ── STEP 2 — Documentos ─────────────────────────────────── */}
        {step === 2 && (
          <>
            <Section title="Documentos de identificação">
              <div className={`${styles.grid3} ${styles.marginTop}`}>
                <Input label="CPF" required placeholder="000.000.000-00" inputMode="numeric" maxLength={14}
                  value={form.cpf} onChange={(e) => set("cpf", formatCpfBR(e.target.value))} error={errors.cpf} />
                <Input label="RG" placeholder="0000000"
                  value={form.rg} onChange={(e) => set("rg", e.target.value)} />
                <Input label="Órgão emissor RG" placeholder="SSP"
                  value={form.rgIssuer} onChange={(e) => set("rgIssuer", e.target.value)} />
                <Select label="UF emissão RG" options={BR_STATES}
                  value={form.rgState} onChange={(e) => set("rgState", e.target.value)} />
                <Input label="Data de emissão RG" type="date"
                  value={form.rgDate} onChange={(e) => set("rgDate", e.target.value)} />
                <Input label="CNH" placeholder="Número da CNH"
                  value={form.cnh} onChange={(e) => set("cnh", e.target.value)} />
                <Input label="Passaporte" placeholder="Número do passaporte"
                  value={form.passport} onChange={(e) => set("passport", e.target.value)} />
                <Input label="Código legado" placeholder="Código anterior (migração)"
                  value={form.legacyCode} onChange={(e) => set("legacyCode", e.target.value)} />
              </div>
            </Section>

            <Section title="Convênio / Plano de saúde">
              <div className={`${styles.grid3} ${styles.marginTop}`}>
                <Select label="Convênio" options={HEALTH_INS}
                  value={form.healthInsurance} onChange={(e) => set("healthInsurance", e.target.value)} />
                <Input label="Número da carteirinha" placeholder="Número do plano"
                  value={form.healthInsuranceNumber} onChange={(e) => set("healthInsuranceNumber", e.target.value)} />
                <Input label="Plano/Modalidade" placeholder="Ex: Enfermaria, Apartamento"
                  value={form.healthInsurancePlan} onChange={(e) => set("healthInsurancePlan", e.target.value)} />
                <Input label="Validade do plano" type="date"
                  value={form.healthInsuranceExpiry} onChange={(e) => set("healthInsuranceExpiry", e.target.value)} />
                <div style={{ paddingTop:20 }}>
                  <CheckRow field="isNewbornOnInsurance" label="Recém-nascido incluído no plano" />
                </div>
              </div>
            </Section>
          </>
        )}

        {/* ── STEP 3 — Endereço ────────────────────────────────────── */}
        {step === 3 && (
          <Section title="Endereço residencial">
            <div className={`${styles.grid3} ${styles.marginTop}`}>
              <Input label="CEP" placeholder="00000-000" inputMode="numeric" maxLength={9}
                value={form.zipCode}
                onChange={(e) => set("zipCode", formatCepBR(e.target.value))}
                onBlur={handleCepBlur} />
              <Input label="Logradouro / Rua" placeholder="Nome da rua"
                value={form.street} onChange={(e) => set("street", e.target.value)}
                className={styles.colSpan2} />
              <Input label="Número" placeholder="Nº"
                value={form.addressNumber} onChange={(e) => set("addressNumber", e.target.value)} />
              <Input label="Complemento" placeholder="Apto, Bloco..."
                value={form.complement} onChange={(e) => set("complement", e.target.value)} />
              <Input label="Bairro"
                value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} />
              <Input label="Cidade"
                value={form.city} onChange={(e) => set("city", e.target.value)} />
              <Select label="Estado (UF)" options={BR_STATES}
                value={form.state} onChange={(e) => set("state", e.target.value)} />
              <Input label="Ponto de referência" placeholder="Ex: Próximo à escola"
                value={form.reference} onChange={(e) => set("reference", e.target.value)}
                className={styles.colSpan2} />
            </div>
          </Section>
        )}

        {/* ── STEP 4 — Contato e Família ───────────────────────────── */}
        {step === 4 && (
          <>
            <Section title="Contatos">
              <div className={`${styles.grid3} ${styles.marginTop}`}>
                <Input label="Celular" required placeholder="(00) 00000-0000" inputMode="tel" maxLength={15}
                  value={form.phone} onChange={(e) => set("phone", formatPhoneBR(e.target.value))} error={errors.phone} />
                <Input label="Telefone fixo" placeholder="(00) 0000-0000" inputMode="tel" maxLength={15}
                  value={form.landline} onChange={(e) => set("landline", formatPhoneBR(e.target.value))} />
                <Input label="Telefone alternativo" placeholder="(00) 00000-0000" inputMode="tel" maxLength={15}
                  value={form.alternativePhone} onChange={(e) => set("alternativePhone", formatPhoneBR(e.target.value))} />
                <Input label="E-mail" type="email" required placeholder="exemplo@email.com"
                  value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
                <Select label="Canal de comunicação preferido" options={CHANNELS}
                  value={form.preferredChannel} onChange={(e) => set("preferredChannel", e.target.value)} />
                <Select label="Frequência de comunicação" options={FREQUENCIES}
                  value={form.communicationFrequency} onChange={(e) => set("communicationFrequency", e.target.value)} />
                <div style={{ paddingTop:20 }}>
                  <CheckRow field="optIn" label="Aceita receber comunicações" />
                </div>
              </div>
            </Section>

            <Section title="Contato de emergência">
              <div className={`${styles.grid3} ${styles.marginTop}`}>
                <Input label="Nome do contato" placeholder="Nome completo" error={errors.emergencyName}
                  value={form.emergencyName} onChange={(e) => set("emergencyName", e.target.value)} />
                <Select label="Grau de parentesco" options={RELATIONS}
                  value={form.emergencyRelation} onChange={(e) => set("emergencyRelation", e.target.value)} />
                <Input label="Telefone do contato" placeholder="(00) 00000-0000" inputMode="tel" maxLength={15}
                  value={form.emergencyPhone} onChange={(e) => set("emergencyPhone", formatPhoneBR(e.target.value))} />
              </div>
            </Section>

            <Section title="Acesso do paciente">
              <div className={`${styles.portalAccessBox} ${styles.marginTop}`}>
                <CheckRow
                  field="createPortalAccess"
                  label={isEditing ? "Criar acesso ao portal para este paciente" : "Criar usuário paciente com e-mail e senha"}
                />
                <p className={styles.portalAccessText}>
                  O paciente poderá entrar com o e-mail cadastrado e acessar consultas, exames, receitas e laudos vinculados ao CPF/e-mail.
                </p>
                {form.createPortalAccess && (
                  <div className={styles.grid2}>
                    <Input
                      label="Senha de acesso"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={form.portalPassword}
                      onChange={(e) => set("portalPassword", e.target.value)}
                      error={errors.portalPassword}
                    />
                    <Input
                      label="Confirmar senha"
                      type="password"
                      value={form.portalConfirmPassword}
                      onChange={(e) => set("portalConfirmPassword", e.target.value)}
                      error={errors.portalConfirmPassword}
                    />
                  </div>
                )}
              </div>
            </Section>

            <Section title="Filiação">
              <div className={`${styles.grid2} ${styles.marginTop}`}>
                <Input label="Nome da mãe"
                  value={form.motherName} onChange={(e) => set("motherName", e.target.value)} />
                <Input label="Profissão da mãe"
                  value={form.motherOccupation} onChange={(e) => set("motherOccupation", e.target.value)} />
                <Input label="Nome do pai"
                  value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} />
                <Input label="Profissão do pai"
                  value={form.fatherOccupation} onChange={(e) => set("fatherOccupation", e.target.value)} />
                <Input label="Nome do responsável (menores/incapazes)"
                  value={form.guardianName} onChange={(e) => set("guardianName", e.target.value)} />
                <Input label="CPF do responsável" placeholder="000.000.000-00" inputMode="numeric" maxLength={14}
                  value={form.guardianCpf} onChange={(e) => set("guardianCpf", formatCpfBR(e.target.value))} />
                <Input label="Nome do cônjuge/companheiro(a)"
                  value={form.spouseName} onChange={(e) => set("spouseName", e.target.value)} />
              </div>
            </Section>
          </>
        )}

        {/* ── STEP 5 — Saúde e Clínica ─────────────────────────────── */}
        {step === 5 && !isSecretary && (
          <>
            <Section title="Informações clínicas">
              <div className={`${styles.grid3} ${styles.marginTop}`}>
                <Select label="Tipo sanguíneo" options={BLOOD_TYPES}
                  value={form.bloodType} onChange={(e) => set("bloodType", e.target.value)} />
                <Select label="Tabagismo" options={SMOKING}
                  value={form.smokingStatus} onChange={(e) => set("smokingStatus", e.target.value)} />
                <Select label="Consumo de álcool" options={ALCOHOL}
                  value={form.alcoholUse} onChange={(e) => set("alcoholUse", e.target.value)} />
                <Select label="Atividade física" options={PHYSICAL}
                  value={form.physicalActivity} onChange={(e) => set("physicalActivity", e.target.value)} />
              </div>
            </Section>

            <Section title="Histórico de saúde">
              <div style={{ display:"flex",flexDirection:"column",gap:16,marginTop:12 }}>
                <Textarea label="Alergias conhecidas" field="allergies"
                  placeholder="Ex: Penicilina, dipirona, látex, amendoim..." />
                <Textarea label="Doenças crônicas / Diagnósticos prévios" field="chronicDiseases"
                  placeholder="Ex: Diabetes tipo 2, hipertensão, asma..." />
                <Textarea label="Medicamentos em uso contínuo" field="currentMeds"
                  placeholder="Nome, dosagem e frequência de cada medicamento..." />
                <Textarea label="Cirurgias e internações anteriores" field="previousSurgeries"
                  placeholder="Ex: Apendicectomia (2010), fratura de fêmur (2015)..." />
                <Textarea label="Histórico familiar relevante" field="familyHistory"
                  placeholder="Ex: Pai com infarto, mãe com diabetes..." />
                <Textarea label="Observações gerais / Anotações adicionais" field="observations"
                  placeholder="Qualquer outra informação relevante para o atendimento..." rows={4} />
              </div>
            </Section>
          </>
        )}

        {/* Footer */}
        <div className={styles.formFooter}>
          <Button variant="ghost" onClick={() => step > 1 ? setStep((s) => s - 1) : onNavigate("patients")}>
            {step > 1 ? "← Anterior" : "Cancelar"}
          </Button>
          <div className={styles.formFooterRight}>
            {saveError && <span className={styles.saveError}>{saveError}</span>}
            <span className={styles.stepCount}>
              {isEditing ? "Edição rápida" : `Etapa ${step} de ${totalSteps}`}
            </span>
            <Button onClick={handleNext} disabled={isSaving}>
              {isSaving ? "Salvando..." : isEditing ? "Salvar alterações" : step < totalSteps ? "Próximo →" : "Cadastrar paciente"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

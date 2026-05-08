import { useState, useRef } from "react"
import { Button } from "../../components/ui/Button/Button"
import { formatDate } from "../../utils"
import type { Patient, Prescription, PrescriptionMedication, User } from "../../types"
import styles from "./PrescriptionEditor.module.css"

// ─── Drug catalog ─────────────────────────────────────────────────
const DRUG_CATALOG = [
  {
    category: "Analgésicos e Antitérmicos",
    drugs: [
      { name: "Paracetamol",           concentrations: ["500mg", "750mg", "1g"],                 forms: ["Comprimido", "Solução oral 200mg/mL", "Supositório"] },
      { name: "Dipirona Sódica",       concentrations: ["500mg", "1g"],                          forms: ["Comprimido", "Solução oral 500mg/mL", "Gotas", "Injeção"] },
      { name: "Ibuprofeno",            concentrations: ["200mg", "400mg", "600mg"],              forms: ["Comprimido", "Cápsula", "Suspensão oral 50mg/mL"] },
      { name: "Codeína + Paracetamol", concentrations: ["30mg + 500mg"],                         forms: ["Comprimido"] },
    ],
  },
  {
    category: "Anti-inflamatórios",
    drugs: [
      { name: "Diclofenaco Sódico",    concentrations: ["50mg", "75mg", "100mg"],               forms: ["Comprimido", "Comprimido revestido", "Gel 1%", "Injeção"] },
      { name: "Nimesulida",            concentrations: ["100mg"],                                forms: ["Comprimido", "Grânulos para suspensão"] },
      { name: "Meloxicam",             concentrations: ["7,5mg", "15mg"],                        forms: ["Comprimido", "Injeção"] },
      { name: "Naproxeno",             concentrations: ["250mg", "500mg"],                       forms: ["Comprimido"] },
      { name: "Cetoprofeno",           concentrations: ["50mg", "100mg"],                        forms: ["Comprimido", "Cápsula", "Gel 2,5%"] },
    ],
  },
  {
    category: "Antibióticos",
    drugs: [
      { name: "Amoxicilina",           concentrations: ["250mg", "500mg", "875mg"],             forms: ["Cápsula", "Comprimido", "Suspensão oral 250mg/5mL"] },
      { name: "Amoxicilina + Clavulanato", concentrations: ["500mg + 125mg", "875mg + 125mg"], forms: ["Comprimido", "Suspensão oral"] },
      { name: "Azitromicina",          concentrations: ["250mg", "500mg"],                       forms: ["Comprimido", "Suspensão oral 200mg/5mL"] },
      { name: "Ciprofloxacino",        concentrations: ["250mg", "500mg", "750mg"],             forms: ["Comprimido"] },
      { name: "Cefalexina",            concentrations: ["500mg"],                                forms: ["Cápsula", "Suspensão oral 250mg/5mL"] },
      { name: "Doxiciclina",           concentrations: ["100mg"],                                forms: ["Cápsula", "Comprimido"] },
      { name: "Metronidazol",          concentrations: ["250mg", "400mg"],                       forms: ["Comprimido", "Gel vaginal 0,75%"] },
      { name: "Clindamicina",          concentrations: ["150mg", "300mg"],                       forms: ["Cápsula", "Solução tópica"] },
    ],
  },
  {
    category: "Anti-hipertensivos",
    drugs: [
      { name: "Losartana Potássica",   concentrations: ["25mg", "50mg", "100mg"],               forms: ["Comprimido"] },
      { name: "Enalapril",             concentrations: ["5mg", "10mg", "20mg"],                  forms: ["Comprimido"] },
      { name: "Amlodipina",            concentrations: ["5mg", "10mg"],                          forms: ["Comprimido"] },
      { name: "Atenolol",              concentrations: ["25mg", "50mg", "100mg"],               forms: ["Comprimido"] },
      { name: "Carvedilol",            concentrations: ["3,125mg", "6,25mg", "12,5mg", "25mg"], forms: ["Comprimido"] },
      { name: "Hidroclorotiazida",     concentrations: ["12,5mg", "25mg", "50mg"],              forms: ["Comprimido"] },
      { name: "Espironolactona",       concentrations: ["25mg", "50mg", "100mg"],               forms: ["Comprimido"] },
    ],
  },
  {
    category: "Diabetes",
    drugs: [
      { name: "Metformina",            concentrations: ["500mg", "850mg", "1g"],                forms: ["Comprimido", "Comprimido revestido"] },
      { name: "Glibenclamida",         concentrations: ["5mg"],                                  forms: ["Comprimido"] },
      { name: "Gliclazida",            concentrations: ["30mg", "60mg"],                         forms: ["Comprimido de liberação modificada"] },
      { name: "Sitagliptina",          concentrations: ["50mg", "100mg"],                        forms: ["Comprimido"] },
      { name: "Empagliflozina",        concentrations: ["10mg", "25mg"],                         forms: ["Comprimido"] },
    ],
  },
  {
    category: "Gastroenterológicos",
    drugs: [
      { name: "Omeprazol",             concentrations: ["10mg", "20mg", "40mg"],                forms: ["Cápsula"] },
      { name: "Pantoprazol",           concentrations: ["20mg", "40mg"],                         forms: ["Comprimido revestido"] },
      { name: "Esomeprazol",           concentrations: ["20mg", "40mg"],                         forms: ["Cápsula"] },
      { name: "Metoclopramida",        concentrations: ["10mg"],                                  forms: ["Comprimido", "Solução oral", "Injeção"] },
      { name: "Domperidona",           concentrations: ["10mg"],                                  forms: ["Comprimido", "Suspensão oral 1mg/mL"] },
      { name: "Loperamida",            concentrations: ["2mg"],                                   forms: ["Cápsula", "Comprimido"] },
      { name: "Simeticona",            concentrations: ["40mg", "80mg"],                          forms: ["Comprimido", "Gotas"] },
    ],
  },
  {
    category: "Saúde Mental",
    drugs: [
      { name: "Sertralina",            concentrations: ["25mg", "50mg", "100mg"],               forms: ["Comprimido"] },
      { name: "Fluoxetina",            concentrations: ["20mg", "40mg"],                         forms: ["Cápsula", "Solução oral 20mg/mL"] },
      { name: "Escitalopram",          concentrations: ["10mg", "20mg"],                         forms: ["Comprimido"] },
      { name: "Venlafaxina",           concentrations: ["37,5mg", "75mg", "150mg"],             forms: ["Cápsula de liberação prolongada"] },
      { name: "Alprazolam",            concentrations: ["0,25mg", "0,5mg", "1mg"],              forms: ["Comprimido"] },
      { name: "Clonazepam",            concentrations: ["0,5mg", "1mg", "2mg"],                 forms: ["Comprimido"] },
      { name: "Quetiapina",            concentrations: ["25mg", "50mg", "100mg", "200mg"],      forms: ["Comprimido"] },
    ],
  },
  {
    category: "Corticoides",
    drugs: [
      { name: "Prednisona",            concentrations: ["5mg", "20mg"],                          forms: ["Comprimido"] },
      { name: "Dexametasona",          concentrations: ["0,75mg", "4mg"],                        forms: ["Comprimido", "Elixir", "Injeção"] },
      { name: "Betametasona",          concentrations: ["0,1%"],                                  forms: ["Creme", "Pomada", "Loção"] },
      { name: "Budesonida",            concentrations: ["32mcg", "64mcg", "200mcg"],            forms: ["Spray nasal", "Inalador"] },
      { name: "Fluticasona",           concentrations: ["50mcg", "100mcg", "250mcg"],           forms: ["Spray nasal", "Inalador"] },
    ],
  },
  {
    category: "Cardiovascular",
    drugs: [
      { name: "Sinvastatina",          concentrations: ["10mg", "20mg", "40mg", "80mg"],       forms: ["Comprimido"] },
      { name: "Atorvastatina",         concentrations: ["10mg", "20mg", "40mg", "80mg"],       forms: ["Comprimido"] },
      { name: "AAS",                   concentrations: ["100mg", "200mg", "500mg"],             forms: ["Comprimido"] },
      { name: "Clopidogrel",           concentrations: ["75mg"],                                  forms: ["Comprimido"] },
      { name: "Furosemida",            concentrations: ["40mg"],                                  forms: ["Comprimido", "Injeção"] },
    ],
  },
  {
    category: "Outros",
    drugs: [
      { name: "Levotiroxina",          concentrations: ["25mcg", "50mcg", "75mcg", "100mcg", "125mcg"], forms: ["Comprimido"] },
      { name: "Ferro Sulfato",         concentrations: ["40mg", "60mg"],                         forms: ["Comprimido", "Solução oral"] },
      { name: "Vitamina D3",           concentrations: ["1000UI", "2000UI", "7000UI", "10000UI"], forms: ["Cápsula", "Gotas"] },
      { name: "Ácido Fólico",          concentrations: ["0,4mg", "5mg"],                         forms: ["Comprimido"] },
      { name: "Loratadina",            concentrations: ["10mg"],                                  forms: ["Comprimido", "Xarope 1mg/mL"] },
      { name: "Cetirizina",            concentrations: ["10mg"],                                  forms: ["Comprimido", "Xarope 1mg/mL"] },
      { name: "Montelucaste",          concentrations: ["4mg", "5mg", "10mg"],                  forms: ["Comprimido", "Sachê"] },
    ],
  },
]

const POSOLOGY_TEMPLATES = [
  "Tomar 1 comprimido a cada 4 horas",
  "Tomar 1 comprimido a cada 6 horas",
  "Tomar 1 comprimido a cada 8 horas",
  "Tomar 1 comprimido a cada 12 horas",
  "Tomar 1 comprimido uma vez ao dia (manhã)",
  "Tomar 1 comprimido uma vez ao dia (noite)",
  "Tomar 1 comprimido duas vezes ao dia",
  "Tomar 1 comprimido três vezes ao dia",
  "Tomar conforme necessário (máx. 4 vezes ao dia)",
  "Aplicar uma vez ao dia na região afetada",
  "Uso tópico conforme orientação",
  "Inalação conforme prescrito",
]

const DURATION_OPTIONS = [
  "3 dias", "5 dias", "7 dias", "10 dias", "14 dias",
  "21 dias", "30 dias", "60 dias", "90 dias", "Uso contínuo",
]

const PRESCRIPTION_TYPES = [
  { value: "simple",        label: "Receita Simples",            desc: "Medicamentos comuns" },
  { value: "special",       label: "Receita de Controle Especial", desc: "Psicotrópicos e controlados" },
  { value: "antimicrobial", label: "Receita Antimicrobiana",     desc: "Antibióticos e antifúngicos" },
]

// ─── Interfaces ───────────────────────────────────────────────────
interface PrescriptionEditorProps {
  patient: Patient
  currentUser: User
  existingPrescription?: Prescription | null
  onClose: () => void
  onSave: (p: Omit<Prescription, "id">) => void | Promise<void>
}

type MedRow = Omit<PrescriptionMedication, "id"> & { _key: number }

const EMPTY_MED: Omit<MedRow, "_key"> = {
  name: "", concentration: "", form: "", quantity: "", posology: "", duration: "", instructions: "",
}

interface AiPrescriptionResult {
  type: "simple" | "special" | "antimicrobial"
  cid10?: string
  observations: string
  medications: Omit<MedRow, "_key">[]
}

async function aiCompletePrescription(
  patient: Patient,
  clinicalContext: string,
  currentCid10: string,
): Promise<AiPrescriptionResult> {
  await new Promise((resolve) => setTimeout(resolve, 300))
  const source = [
    clinicalContext,
    currentCid10,
    patient.observations,
    patient.healthInsurance,
  ].filter(Boolean).join(" ").toLowerCase()

  if (source.includes("i10") || source.includes("hipertens")) {
    return {
      type: "simple",
      cid10: currentCid10 || "I10",
      observations: "Rascunho gerado por IA para revisão médica. Orientar aferição pressórica e retorno conforme evolução.",
      medications: [
        {
          name: "Losartana Potássica",
          concentration: "50mg",
          form: "Comprimido",
          quantity: "30 comprimidos",
          posology: "Tomar 1 comprimido uma vez ao dia (manhã)",
          duration: "30 dias",
          instructions: "Reavaliar pressão arterial e função renal conforme critério médico.",
        },
      ],
    }
  }

  if (source.includes("e11") || source.includes("diabet")) {
    return {
      type: "simple",
      cid10: currentCid10 || "E11",
      observations: "Rascunho gerado por IA para revisão médica. Reforçar dieta, hidratação e monitorização glicêmica.",
      medications: [
        {
          name: "Metformina",
          concentration: "500mg",
          form: "Comprimido",
          quantity: "60 comprimidos",
          posology: "Tomar 1 comprimido duas vezes ao dia",
          duration: "30 dias",
          instructions: "Tomar após as refeições.",
        },
      ],
    }
  }

  if (source.includes("j") || source.includes("tosse") || source.includes("resfri") || source.includes("febre")) {
    return {
      type: "simple",
      cid10: currentCid10 || "J06.9",
      observations: "Rascunho gerado por IA para revisão médica. Orientar hidratação, repouso e retorno se sinais de alarme.",
      medications: [
        {
          name: "Paracetamol",
          concentration: "750mg",
          form: "Comprimido",
          quantity: "12 comprimidos",
          posology: "Tomar 1 comprimido a cada 8 horas",
          duration: "3 dias",
          instructions: "Usar se dor ou febre.",
        },
        {
          name: "Loratadina",
          concentration: "10mg",
          form: "Comprimido",
          quantity: "10 comprimidos",
          posology: "Tomar 1 comprimido uma vez ao dia (manhã)",
          duration: "10 dias",
          instructions: "Usar se sintomas alérgicos ou coriza.",
        },
      ],
    }
  }

  if (source.includes("dor") || source.includes("m54") || source.includes("lomb")) {
    return {
      type: "simple",
      cid10: currentCid10 || "M54.5",
      observations: "Rascunho gerado por IA para revisão médica. Orientar repouso relativo e reavaliação se piora ou déficit neurológico.",
      medications: [
        {
          name: "Ibuprofeno",
          concentration: "400mg",
          form: "Comprimido",
          quantity: "15 comprimidos",
          posology: "Tomar 1 comprimido a cada 8 horas",
          duration: "5 dias",
          instructions: "Tomar após as refeições.",
        },
      ],
    }
  }

  return {
    type: "simple",
    cid10: currentCid10 || undefined,
    observations: "Rascunho gerado por IA para revisão médica. Ajustar medicamentos, dose e duração conforme avaliação clínica.",
    medications: [
      {
        name: "Paracetamol",
        concentration: "500mg",
        form: "Comprimido",
        quantity: "12 comprimidos",
        posology: "Tomar 1 comprimido a cada 8 horas",
        duration: "3 dias",
        instructions: "Usar se dor ou febre.",
      },
    ],
  }
}

// ─── PrescriptionEditor ───────────────────────────────────────────
export function PrescriptionEditor({ patient, currentUser, onClose, onSave }: PrescriptionEditorProps) {
  const today = new Date().toISOString().split("T")[0]
  const [rxType, setRxType]   = useState<"simple" | "special" | "antimicrobial">("simple")
  const [date, setDate]       = useState(today)
  const [cid10, setCid10]     = useState("")
  const [obs, setObs]         = useState("")
  const [meds, setMeds]       = useState<MedRow[]>([{ ...EMPTY_MED, _key: 1 }])
  const [search, setSearch]   = useState("")
  const [activeCat, setActiveCat] = useState(DRUG_CATALOG[0].category)
  const [preview, setPreview] = useState(false)
  const [clinicalContext, setClinicalContext] = useState("")
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const keyRef = useRef(1)

  function addMed(drugName: string, concentration: string, form: string) {
    keyRef.current++
    setMeds(prev => [...prev, { ...EMPTY_MED, _key: keyRef.current, name: drugName, concentration, form }])
  }

  function updateMed(key: number, field: keyof Omit<MedRow, "_key">, value: string) {
    setMeds(prev => prev.map(m => m._key === key ? { ...m, [field]: value } : m))
  }

  function removeMed(key: number) {
    setMeds(prev => prev.filter(m => m._key !== key))
  }

  async function handleAiComplete() {
    setIsAiLoading(true)
    setError(null)
    try {
      const result = await aiCompletePrescription(patient, clinicalContext, cid10)
      setRxType(result.type)
      if (result.cid10) setCid10(result.cid10)
      setObs((current) => current.trim() ? current : result.observations)
      setMeds(result.medications.map((med) => {
        keyRef.current++
        return { ...med, _key: keyRef.current }
      }))
    } catch {
      setError("IA indisponível no momento. Continue preenchendo manualmente.")
    } finally {
      setIsAiLoading(false)
    }
  }

  async function handleSave(emitNow: boolean) {
    const medications = meds.filter(m => m.name).map((m, i) => ({ ...m, id: String(i + 1) }))
    if (medications.length === 0) {
      setError("Inclua ao menos um medicamento.")
      return false
    }
    const rx: Omit<Prescription, "id"> = {
      patientId:        patient.id,
      patientName:      patient.name,
      patientDob:       patient.dob,
      doctorId:         currentUser.id,
      doctorName:       currentUser.name,
      doctorCrm:        currentUser.crm,
      doctorSpecialty:  currentUser.specialty,
      date,
      type:             rxType,
      medications,
      cid10:            cid10 || undefined,
      observations:     obs || undefined,
      status:           emitNow ? "emitted" : "draft",
    }
    setIsSaving(true)
    setError(null)
    try {
      await onSave(rx)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar receita.")
      return false
    } finally {
      setIsSaving(false)
    }
  }

  // Filtered drugs for catalog
  const filteredDrugs = DRUG_CATALOG
    .flatMap(c => c.drugs.map(d => ({ ...d, category: c.category })))
    .filter(d => search ? d.name.toLowerCase().includes(search.toLowerCase()) : d.category === activeCat)

  if (preview) {
    return <PrescriptionPreview
      patient={patient}
      currentUser={currentUser}
      date={date}
      rxType={rxType}
      meds={meds}
      cid10={cid10}
      obs={obs}
      onBack={() => setPreview(false)}
      onEmit={async () => { if (await handleSave(true)) onClose() }}
    />
  }

  return (
    <div className={styles.root}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={onClose}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <div>
            <p className={styles.headerTitle}>Nova Receita Médica</p>
            <p className={styles.headerSub}>{patient.name} · {currentUser.name}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" onClick={handleAiComplete} disabled={isAiLoading || isSaving}>
            {isAiLoading ? "Completando..." : "Completar com IA"}
          </Button>
          <Button variant="ghost" onClick={() => handleSave(false)} disabled={isSaving}>Salvar rascunho</Button>
          <Button variant="ghost" onClick={() => setPreview(true)}>Pré-visualizar</Button>
          <Button onClick={async () => { if (await handleSave(true)) onClose() }} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Emitir receita"}
          </Button>
        </div>
      </div>

      <div className={styles.body}>
        {/* ── Left column ──────────────────────────────────────── */}
        <div className={styles.leftCol}>

          {/* Patient + doctor info */}
          <div className={styles.infoCard}>
            <div className={styles.infoBlock}>
              <p className={styles.infoBlockTitle}>Paciente</p>
              <p className={styles.infoBlockName}>{patient.name}</p>
              <p className={styles.infoBlockSub}>
                Nasc.: {patient.dob ? formatDate(patient.dob) : "—"}
                {patient.address ? ` · ${patient.address.city}/${patient.address.state}` : ""}
              </p>
            </div>
            <div className={styles.infoBlockDivider} />
            <div className={styles.infoBlock}>
              <p className={styles.infoBlockTitle}>Médico emitente</p>
              <p className={styles.infoBlockName}>{currentUser.name}</p>
              <p className={styles.infoBlockSub}>
                {currentUser.crm ? `CRM: ${currentUser.crm}` : ""}
                {currentUser.specialty ? ` · ${currentUser.specialty}` : ""}
              </p>
            </div>
          </div>

          <div className={styles.aiCard}>
            <div className={styles.aiCardHeader}>
              <div>
                <p className={styles.aiTitle}>Assistente IA</p>
                <p className={styles.aiSub}>Gera um rascunho para revisão do médico antes da emissão.</p>
              </div>
              <Button variant="outline" onClick={handleAiComplete} disabled={isAiLoading || isSaving}>
                {isAiLoading ? "Completando..." : "Preencher receita"}
              </Button>
            </div>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Informe hipótese diagnóstica, sintomas, alergias relevantes ou objetivo terapêutico..."
              value={clinicalContext}
              onChange={(e) => {
                setClinicalContext(e.target.value)
                setError(null)
              }}
            />
          </div>

          {/* Prescription type + date */}
          <div className={styles.typeRow}>
            <div className={styles.formField}>
              <label className={styles.label}>Tipo de receita</label>
              <div className={styles.typeCards}>
                {PRESCRIPTION_TYPES.map(t => (
                  <button
                    key={t.value}
                    className={`${styles.typeCard} ${rxType === t.value ? styles.typeCardActive : ""}`}
                    onClick={() => setRxType(t.value as typeof rxType)}
                  >
                    <span className={styles.typeCardLabel}>{t.label}</span>
                    <span className={styles.typeCardDesc}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.formField} style={{ flexShrink: 0 }}>
              <label className={styles.label}>Data da receita</label>
              <input
                type="date"
                className={styles.input}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Medications list */}
          <div className={styles.medsSection}>
            <div className={styles.medsSectionHeader}>
              <p className={styles.sectionTitle}>Medicamentos prescritos</p>
              <button
                className={styles.addMedBtn}
                onClick={() => { keyRef.current++; setMeds(p => [...p, { ...EMPTY_MED, _key: keyRef.current }]) }}
              >
                + Adicionar linha
              </button>
            </div>

            {meds.length === 0 && (
              <p className={styles.emptyMeds}>Nenhum medicamento adicionado. Use o catálogo ao lado.</p>
            )}

            {meds.map((m, idx) => (
              <div key={m._key} className={styles.medRow}>
                <div className={styles.medRowNum}>{idx + 1}</div>
                <div className={styles.medRowFields}>
                  <div className={styles.medFieldWide}>
                    <label className={styles.smallLabel}>Medicamento</label>
                    <input
                      className={styles.input}
                      placeholder="Nome do medicamento"
                      value={m.name}
                      onChange={e => updateMed(m._key, "name", e.target.value)}
                    />
                  </div>
                  <div className={styles.medFieldSm}>
                    <label className={styles.smallLabel}>Concentração</label>
                    <input
                      className={styles.input}
                      placeholder="Ex: 500mg"
                      value={m.concentration}
                      onChange={e => updateMed(m._key, "concentration", e.target.value)}
                    />
                  </div>
                  <div className={styles.medFieldMd}>
                    <label className={styles.smallLabel}>Forma farmacêutica</label>
                    <input
                      className={styles.input}
                      placeholder="Ex: Comprimido"
                      value={m.form}
                      onChange={e => updateMed(m._key, "form", e.target.value)}
                    />
                  </div>
                  <div className={styles.medFieldSm}>
                    <label className={styles.smallLabel}>Quantidade</label>
                    <input
                      className={styles.input}
                      placeholder="Ex: 20 compr."
                      value={m.quantity}
                      onChange={e => updateMed(m._key, "quantity", e.target.value)}
                    />
                  </div>
                  <div className={styles.medFieldFull}>
                    <label className={styles.smallLabel}>Posologia (como tomar)</label>
                    <input
                      list={`posology-${m._key}`}
                      className={styles.input}
                      placeholder="Ex: Tomar 1 comprimido de 8 em 8 horas"
                      value={m.posology}
                      onChange={e => updateMed(m._key, "posology", e.target.value)}
                    />
                    <datalist id={`posology-${m._key}`}>
                      {POSOLOGY_TEMPLATES.map(t => <option key={t} value={t} />)}
                    </datalist>
                  </div>
                  <div className={styles.medFieldMd}>
                    <label className={styles.smallLabel}>Duração</label>
                    <select
                      className={styles.select}
                      value={m.duration}
                      onChange={e => updateMed(m._key, "duration", e.target.value)}
                    >
                      <option value="">Selecionar...</option>
                      {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className={styles.medFieldFull}>
                    <label className={styles.smallLabel}>Instruções adicionais (opcional)</label>
                    <input
                      className={styles.input}
                      placeholder="Ex: Tomar após as refeições, evitar álcool..."
                      value={m.instructions ?? ""}
                      onChange={e => updateMed(m._key, "instructions", e.target.value)}
                    />
                  </div>
                </div>
                <button className={styles.removeMedBtn} onClick={() => removeMed(m._key)} title="Remover">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* CID-10 + Observations */}
          <div className={styles.footer}>
            <div className={styles.formField} style={{ maxWidth: 200 }}>
              <label className={styles.label}>CID-10</label>
              <input
                className={styles.input}
                placeholder="Ex: J06.9"
                value={cid10}
                onChange={e => setCid10(e.target.value.toUpperCase())}
              />
            </div>
            <div className={styles.formField} style={{ flex: 1 }}>
              <label className={styles.label}>Observações</label>
              <textarea
                className={styles.textarea}
                placeholder="Instruções gerais, retorno, cuidados..."
                rows={2}
                value={obs}
                onChange={e => setObs(e.target.value)}
              />
            </div>
          </div>
          {error && <p className={styles.errorMsg}>{error}</p>}
        </div>

        {/* ── Right column — Drug catalog ────────────────────── */}
        <aside className={styles.catalog}>
          <p className={styles.catalogTitle}>Catálogo de medicamentos</p>
          <input
            className={styles.catalogSearch}
            placeholder="Buscar medicamento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {!search && (
            <div className={styles.catTabs}>
              {DRUG_CATALOG.map(c => (
                <button
                  key={c.category}
                  className={`${styles.catTab} ${activeCat === c.category ? styles.catTabActive : ""}`}
                  onClick={() => setActiveCat(c.category)}
                >
                  {c.category}
                </button>
              ))}
            </div>
          )}

          <div className={styles.drugList}>
            {filteredDrugs.map(drug => (
              <div key={drug.name} className={styles.drugCard}>
                <div className={styles.drugInfo}>
                  <p className={styles.drugName}>{drug.name}</p>
                  <p className={styles.drugDetails}>
                    {drug.concentrations.slice(0, 3).join(" · ")}
                    {drug.concentrations.length > 3 ? ` +${drug.concentrations.length - 3}` : ""}
                  </p>
                  <p className={styles.drugForms}>{drug.forms.join(", ")}</p>
                </div>
                <div className={styles.drugActions}>
                  {drug.concentrations.slice(0, 2).map(c => (
                    <button
                      key={c}
                      className={styles.quickAddBtn}
                      onClick={() => addMed(drug.name, c, drug.forms[0])}
                      title={`Adicionar ${drug.name} ${c}`}
                    >
                      + {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

// ─── Preview ──────────────────────────────────────────────────────
interface PreviewProps {
  patient: Patient
  currentUser: User
  date: string
  rxType: string
  meds: MedRow[]
  cid10: string
  obs: string
  onBack: () => void
  onEmit: () => void
}

const RX_TYPE_LABELS: Record<string, string> = {
  simple: "RECEITA MÉDICA SIMPLES",
  special: "RECEITA DE CONTROLE ESPECIAL",
  antimicrobial: "RECEITA ANTIMICROBIANA",
}

function PrescriptionPreview({ patient, currentUser, date, rxType, meds, cid10, obs, onBack, onEmit }: PreviewProps) {
  const filledMeds = meds.filter(m => m.name)
  return (
    <div className={styles.previewRoot}>
      <div className={styles.previewToolbar}>
        <Button variant="ghost" onClick={onBack}>← Voltar para edição</Button>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" onClick={() => window.print()}>Imprimir</Button>
          <Button onClick={onEmit}>Emitir receita</Button>
        </div>
      </div>

      <div className={styles.rxDocument}>
        {/* Header */}
        <div className={styles.rxClinic}>
          <div>
            <p className={styles.rxClinicName}>Mediconnect Clínica Médica</p>
            <p className={styles.rxClinicInfo}>Av. Principal, 1000 · Aracaju / SE · (79) 3000-0000</p>
          </div>
          <div className={styles.rxDateBlock}>
            <p className={styles.rxDateLabel}>Data</p>
            <p className={styles.rxDateValue}>{date ? formatDate(date) : "—"}</p>
          </div>
        </div>

        <div className={styles.rxDividerTop} />

        {/* Title */}
        <p className={styles.rxTitle}>{RX_TYPE_LABELS[rxType] ?? "RECEITA MÉDICA"}</p>

        {/* Patient */}
        <div className={styles.rxPatient}>
          <div className={styles.rxPatientField}>
            <span className={styles.rxFieldLabel}>Paciente:</span>
            <span className={styles.rxFieldValue}>{patient.name}</span>
          </div>
          <div className={styles.rxPatientField}>
            <span className={styles.rxFieldLabel}>Data de nascimento:</span>
            <span className={styles.rxFieldValue}>{patient.dob ? formatDate(patient.dob) : "—"}</span>
          </div>
          {patient.address && (
            <div className={styles.rxPatientField}>
              <span className={styles.rxFieldLabel}>Endereço:</span>
              <span className={styles.rxFieldValue}>
                {patient.address.street}, {patient.address.number} — {patient.address.neighborhood}, {patient.address.city}/{patient.address.state}
              </span>
            </div>
          )}
        </div>

        <div className={styles.rxDivider} />

        {/* Medications */}
        <div className={styles.rxMeds}>
          {filledMeds.length === 0 && (
            <p className={styles.rxEmpty}>Nenhum medicamento prescrito.</p>
          )}
          {filledMeds.map((m, i) => (
            <div key={m._key} className={styles.rxMedItem}>
              <p className={styles.rxMedName}>
                {i + 1}. {m.name} {m.concentration} — {m.form}
              </p>
              {m.posology && <p className={styles.rxMedLine}>Posologia: {m.posology}</p>}
              {m.duration && <p className={styles.rxMedLine}>Duração: {m.duration}</p>}
              {m.quantity && <p className={styles.rxMedLine}>Quantidade: {m.quantity}</p>}
              {m.instructions && <p className={styles.rxMedInstructions}>Obs.: {m.instructions}</p>}
            </div>
          ))}
        </div>

        {cid10 && (
          <>
            <div className={styles.rxDivider} />
            <p className={styles.rxCid}>CID-10: {cid10}</p>
          </>
        )}

        {obs && (
          <>
            <div className={styles.rxDivider} />
            <div>
              <p className={styles.rxObsTitle}>Observações:</p>
              <p className={styles.rxObs}>{obs}</p>
            </div>
          </>
        )}

        {/* Signature */}
        <div className={styles.rxSignature}>
          <div className={styles.rxSignatureLine} />
          <p className={styles.rxDoctorName}>{currentUser.name}</p>
          {currentUser.crm && <p className={styles.rxDoctorInfo}>CRM: {currentUser.crm}</p>}
          {currentUser.specialty && <p className={styles.rxDoctorInfo}>{currentUser.specialty}</p>}
        </div>
      </div>
    </div>
  )
}

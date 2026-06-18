import { chatComplete, type ChatMessage } from "./ai"
import { extractJsonBlock } from "./reportAI"
import { onlyDigits, toTitleCase } from "../utils"
import { normalizeSpokenEmail } from "../utils/spokenSymbols"

export type PatientVoiceFieldKey =
  | "name"
  | "gender"
  | "dob"
  | "cpf"
  | "healthInsurance"
  | "zipCode"
  | "addressNumber"
  | "phone"
  | "email"
  | "emergencyName"
  | "emergencyRelation"
  | "emergencyPhone"
  | "bloodType"
  | "allergies"

export interface PatientVoiceFieldStep {
  key: PatientVoiceFieldKey
  prompt: string
  step: number
}

export interface PatientVoiceParseResult {
  name?: string
  gender?: string
  dob?: string
  cpf?: string
  healthInsurance?: string
  zipCode?: string
  addressNumber?: string
  phone?: string
  email?: string
  emergencyName?: string
  emergencyRelation?: string
  emergencyPhone?: string
  bloodType?: string
  allergies?: string
}

const HEALTH_INS = [
  "Nenhum (Particular)", "SUS", "Unimed", "Bradesco Saúde", "Amil", "SulAmérica",
  "Notre Dame", "Hapvida", "Assim Saúde", "Porto Seguro", "Outro",
]

const RELATIONS = ["Cônjuge", "Pai", "Mãe", "Filho(a)", "Irmão/Irmã", "Avô/Avó", "Amigo(a)", "Outro"]
const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Não sabe"]

const BASE_STEPS: PatientVoiceFieldStep[] = [
  { key: "name", prompt: "Diga o nome completo do paciente", step: 1 },
  { key: "dob", prompt: "Diga a data de nascimento, por exemplo 15 de março de 1990", step: 1 },
  { key: "gender", prompt: "Diga o sexo: masculino, feminino ou outro", step: 1 },
  { key: "cpf", prompt: "Diga o CPF", step: 2 },
  { key: "healthInsurance", prompt: "Diga o convênio ou diga particular", step: 2 },
  { key: "zipCode", prompt: "Diga o CEP", step: 3 },
  { key: "addressNumber", prompt: "Diga o número do endereço", step: 3 },
  { key: "phone", prompt: "Diga o celular com DDD", step: 4 },
  { key: "email", prompt: "Diga o e-mail", step: 4 },
  { key: "emergencyName", prompt: "Diga o nome do contato de emergência", step: 4 },
  { key: "emergencyRelation", prompt: "Diga o parentesco, por exemplo mãe ou cônjuge", step: 4 },
  { key: "emergencyPhone", prompt: "Diga o telefone do contato de emergência", step: 4 },
]

const CLINICAL_STEPS: PatientVoiceFieldStep[] = [
  { key: "bloodType", prompt: "Diga o tipo sanguíneo, por exemplo O positivo", step: 5 },
  { key: "allergies", prompt: "Diga alergias conhecidas ou diga nenhuma", step: 5 },
]

export function getPatientVoiceSteps(includeClinical: boolean): PatientVoiceFieldStep[] {
  return includeClinical ? [...BASE_STEPS, ...CLINICAL_STEPS] : BASE_STEPS
}

export function getPatientVoiceFormStep(field: PatientVoiceFieldKey): number {
  return [...BASE_STEPS, ...CLINICAL_STEPS].find((s) => s.key === field)?.step ?? 1
}

const MONTHS: Record<string, string> = {
  janeiro: "01", fevereiro: "02", marco: "03", março: "03", abril: "04",
  maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
  outubro: "10", novembro: "11", dezembro: "12",
}

function stripFieldPrefixes(text: string, field: PatientVoiceFieldKey): string {
  const patterns: Partial<Record<PatientVoiceFieldKey, RegExp[]>> = {
    name: [/^nome (?:completo )?(?:do paciente )?(?:é|e)\s+/i, /^me chamo\s+/i, /^paciente\s+/i],
    dob: [/^data de nascimento (?:é|e)\s+/i, /^nasc(?:eu|imento)?\s+/i],
    gender: [/^sexo (?:é|e)?\s*/i],
    cpf: [/^cpf (?:é|e|numero)?\s*/i],
    healthInsurance: [/^conv[eê]nio (?:é|e)\s+/i, /^plano (?:é|e)\s+/i],
    zipCode: [/^cep (?:é|e)?\s*/i],
    addressNumber: [/^n[uú]mero (?:é|e)?\s*/i, /^numero (?:é|e)?\s*/i],
    phone: [/^celular (?:é|e)\s+/i, /^telefone (?:é|e)\s+/i],
    email: [/^e-?mail (?:é|e)\s+/i],
    emergencyName: [/^contato (?:de emerg[eê]ncia )?(?:é|e)\s+/i, /^nome (?:do contato )?(?:é|e)\s+/i],
    emergencyRelation: [/^parentesco (?:é|e)\s+/i, /^grau de parentesco (?:é|e)\s+/i],
    emergencyPhone: [/^telefone (?:do contato )?(?:é|e)\s+/i],
    bloodType: [/^tipo sangu[ií]neo (?:é|e)\s+/i],
    allergies: [/^alergias (?:é|s[aã]o)?\s*/i],
  }
  let value = text.replace(/\s+/g, " ").trim()
  for (const re of patterns[field] ?? []) {
    value = value.replace(re, "")
  }
  return value.trim()
}

function parseGender(spoken: string): string {
  const value = spoken.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  if (/\b(masculin\w*|homem|homen|male|masc)\b/.test(value)) return "Masculino"
  if (/\b(feminin\w*|mulher|female|fem)\b/.test(value)) return "Feminino"
  if (/\b(outr\w*|nao inform|prefiro n)/.test(value)) return "Outro"
  return ""
}

function parseEmail(spoken: string): string {
  return normalizeSpokenEmail(spoken)
}

function parseSpokenDate(spoken: string): string {
  const raw = spoken.trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return raw

  const br = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
  if (br) {
    const year = br[3].length === 2 ? `19${br[3]}` : br[3]
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`
  }

  const normalized = raw.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  const verbal = normalized.match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/)
  if (verbal) {
    const month = MONTHS[verbal[2]]
    if (month) {
      return `${verbal[3]}-${month}-${verbal[1].padStart(2, "0")}`
    }
  }
  return ""
}

function parseHealthInsurance(spoken: string): string {
  const lower = spoken.toLowerCase()
  if (/particular|nenhum|sus\b|sem conv/.test(lower)) {
    return lower.includes("sus") ? "SUS" : "Nenhum (Particular)"
  }
  const match = HEALTH_INS.find((item) => lower.includes(item.toLowerCase().split(" ")[0]))
  if (match) return match
  if (lower.includes("unimed")) return "Unimed"
  if (lower.includes("bradesco")) return "Bradesco Saúde"
  if (lower.includes("amil")) return "Amil"
  return toTitleCase(spoken)
}

function parseRelation(spoken: string): string {
  const lower = spoken.toLowerCase()
  if (/\bmae|mãe\b/.test(lower)) return "Mãe"
  if (/\bpai\b/.test(lower)) return "Pai"
  if (/\bconjuge|cônjuge|espos/.test(lower)) return "Cônjuge"
  if (/\bfilh/.test(lower)) return "Filho(a)"
  if (/\birma/.test(lower)) return "Irmão/Irmã"
  if (/\bav[oó]\b/.test(lower)) return "Avô/Avó"
  if (/\bamig/.test(lower)) return "Amigo(a)"
  const exact = RELATIONS.find((r) => lower.includes(r.toLowerCase()))
  return exact ?? toTitleCase(spoken)
}

function parseBloodType(spoken: string): string {
  const compact = spoken.toUpperCase().replace(/\s+/g, "")
  if (/^O\+?$/.test(compact) || /O\s*POSITIVO/.test(spoken.toUpperCase())) return "O+"
  if (/^O-?$/.test(compact) || /O\s*NEGATIVO/.test(spoken.toUpperCase())) return "O-"
  const match = BLOOD_TYPES.find((b) => compact.includes(b.replace("+", "").replace("-", "")))
  if (match) return match
  const typed = spoken.toUpperCase().match(/\b(A|B|AB|O)[+-]?\b/)
  if (typed) {
    const base = typed[1]
    const sign = /negativ|menos|-/.test(spoken.toLowerCase()) ? "-" : "+"
    return `${base}${sign}`
  }
  if (/nao sabe|não sabe/.test(spoken.toLowerCase())) return "Não sabe"
  return spoken.trim()
}

/** Normaliza fala de um campo do cadastro de paciente. */
export function normalizePatientVoiceField(field: PatientVoiceFieldKey, spoken: string): string {
  const raw = stripFieldPrefixes(spoken, field)
  if (!raw) return ""

  switch (field) {
    case "name":
    case "emergencyName":
      return toTitleCase(raw)
    case "email":
      return parseEmail(raw)
    case "cpf":
    case "phone":
    case "emergencyPhone":
    case "zipCode":
      return onlyDigits(raw)
    case "gender":
      return parseGender(raw)
    case "dob":
      return parseSpokenDate(raw)
    case "healthInsurance":
      return parseHealthInsurance(raw)
    case "emergencyRelation":
      return parseRelation(raw)
    case "bloodType":
      return parseBloodType(raw)
    case "allergies":
      return /^nenhum|nao|não|sem alerg/i.test(raw) ? "" : raw.charAt(0).toUpperCase() + raw.slice(1)
    case "addressNumber":
      return raw.replace(/[^\dA-Za-z/-]/g, "").trim()
    default:
      return raw
  }
}

export function parsePatientVoiceLocal(
  lines: { field: PatientVoiceFieldKey; spoken: string }[],
): PatientVoiceParseResult {
  const result: PatientVoiceParseResult = {}
  for (const { field, spoken } of lines) {
    const value = normalizePatientVoiceField(field, spoken)
    if (value) result[field] = value
  }
  return result
}

function buildPatientVoiceSystem(includeClinical: boolean): string {
  const fields = includeClinical
    ? "name, gender (Masculino|Feminino|Outro|Não informado), dob (YYYY-MM-DD), cpf (digitos), healthInsurance, zipCode (digitos), addressNumber, phone (digitos), email, emergencyName, emergencyRelation, emergencyPhone (digitos), bloodType, allergies"
    : "name, gender, dob (YYYY-MM-DD), cpf (digitos), healthInsurance, zipCode (digitos), addressNumber, phone (digitos), email, emergencyName, emergencyRelation, emergencyPhone (digitos)"
  return [
    "Voce extrai dados de cadastro de pacientes a partir de transcricao de voz em portugues do Brasil.",
    `Retorne APENAS JSON: { ${fields} }.`,
    "Use null para campos ausentes. CPF, telefone e CEP apenas digitos.",
    "Convênio deve ser um dos valores comuns: SUS, Unimed, Particular, etc.",
    "Nao invente dados nao ditos.",
  ].join(" ")
}

export async function parsePatientVoiceWithAI(input: {
  lines: { field: PatientVoiceFieldKey; spoken: string }[]
  includeClinical: boolean
  localFallback: PatientVoiceParseResult
}): Promise<PatientVoiceParseResult> {
  const transcript = input.lines.map(({ field, spoken }) => `${field}: ${spoken}`).join("\n")
  const messages: ChatMessage[] = [
    { role: "system", content: buildPatientVoiceSystem(input.includeClinical) },
    {
      role: "user",
      content: ["Transcricao guiada campo a campo:", transcript, "Extraia os valores finais."].join("\n"),
    },
  ]

  const raw = await chatComplete(messages, { temperature: 0.1, maxTokens: 900 })
  const jsonBlock = extractJsonBlock(raw)
  if (!jsonBlock) return input.localFallback
  try {
    const parsed = JSON.parse(jsonBlock) as PatientVoiceParseResult
    if (parsed.email) parsed.email = normalizeSpokenEmail(parsed.email)
    return { ...input.localFallback, ...parsed }
  } catch {
    return input.localFallback
  }
}

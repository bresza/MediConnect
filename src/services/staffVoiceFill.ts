import { chatComplete, type ChatMessage } from "./ai"
import { extractJsonBlock } from "./reportAI"
import type { Gender, StaffRole } from "../types"
import { onlyDigits, toTitleCase } from "../utils"
import { normalizeSpokenEmail, normalizeSpokenPassword } from "../utils/spokenSymbols"

export type StaffVoiceFieldKey =
  | "name"
  | "email"
  | "phone"
  | "gender"
  | "cpf"
  | "crmNum"
  | "crmUf"
  | "specialty"
  | "department"
  | "password"

export interface StaffVoiceFieldStep {
  key: StaffVoiceFieldKey
  prompt: string
}

export interface StaffVoiceParseResult {
  name?: string
  email?: string
  phone?: string
  gender?: Gender | ""
  cpf?: string
  crmNum?: string
  crmUf?: string
  specialty?: string
  department?: string
  password?: string
}

const UF_LIST = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]

const UF_BY_SPOKEN: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA",
  ceara: "CE", "distrito federal": "DF", espirito: "ES", goias: "GO",
  maranhao: "MA", "minas gerais": "MG", "mato grosso do sul": "MS",
  "mato grosso": "MT", para: "PA", paraiba: "PB", pernambuco: "PE",
  piaui: "PI", parana: "PR", "rio de janeiro": "RJ", "rio grande do norte": "RN",
  rondonia: "RO", roraima: "RR", "rio grande do sul": "RS",
  "santa catarina": "SC", sergipe: "SE", "sao paulo": "SP", tocantins: "TO",
}

const SPECIALTIES = [
  "Clínica Geral", "Cardiologia", "Dermatologia", "Ginecologia",
  "Neurologia", "Ortopedia", "Pediatria", "Psiquiatria",
  "Oftalmologia", "Urologia", "Endocrinologia", "Oncologia",
]

const COMMON_VOICE_STEPS: StaffVoiceFieldStep[] = [
  { key: "name", prompt: "Diga o nome completo" },
  { key: "email", prompt: "Diga o e-mail" },
  { key: "phone", prompt: "Diga o telefone com DDD" },
  { key: "gender", prompt: "Diga o sexo: masculino, feminino ou outro" },
  { key: "cpf", prompt: "Diga o CPF" },
]

const DOCTOR_STEPS: StaffVoiceFieldStep[] = [
  ...COMMON_VOICE_STEPS,
  { key: "crmNum", prompt: "Diga o número do CRM" },
  { key: "crmUf", prompt: "Diga a UF do CRM, por exemplo SE ou Sergipe" },
  { key: "specialty", prompt: "Diga a especialidade médica" },
  { key: "password", prompt: "Diga a senha de acesso (mínimo 6 caracteres)" },
]

const STAFF_STEPS: StaffVoiceFieldStep[] = [
  ...COMMON_VOICE_STEPS,
  { key: "department", prompt: "Diga o departamento, por exemplo Recepção" },
  { key: "password", prompt: "Diga a senha de acesso (mínimo 6 caracteres)" },
]

export function getStaffVoiceSteps(role: StaffRole): StaffVoiceFieldStep[] {
  return role === "doctor" ? DOCTOR_STEPS : STAFF_STEPS
}

function normalizeSpoken(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function stripFieldPrefixes(text: string, field: StaffVoiceFieldKey): string {
  const patterns: Partial<Record<StaffVoiceFieldKey, RegExp[]>> = {
    name: [/^meu nome (?:completo )?(?:é|e)\s+/i, /^nome (?:completo )?(?:é|e)\s+/i, /^chama(?:-se)?\s+/i],
    email: [/^e-?mail (?:é|e)\s+/i, /^meu e-?mail (?:é|e)\s+/i],
    phone: [/^telefone (?:é|e)\s+/i, /^celular (?:é|e)\s+/i, /^meu telefone (?:é|e)\s+/i],
    gender: [/^sexo (?:é|e)?\s*/i, /^sou\s+/i],
    cpf: [/^cpf (?:é|e|numero)?\s*/i, /^meu cpf (?:é|e)?\s*/i],
    crmNum: [/^crm (?:n[uú]mero)?\s*(?:é|e)?\s*/i, /^n[uú]mero do crm (?:é|e)?\s*/i],
    crmUf: [/^uf (?:do crm )?(?:é|e)?\s*/i, /^estado (?:é|e)?\s*/i],
    specialty: [/^especialidade (?:é|e)\s+/i],
    department: [/^departamento (?:é|e)\s+/i, /^setor (?:é|e)\s+/i],
    password: [/^senha (?:de acesso )?(?:é|e)\s+/i, /^a senha (?:é|e)\s+/i],
  }
  let value = normalizeSpoken(text)
  for (const re of patterns[field] ?? []) {
    value = value.replace(re, "")
  }
  return value.trim()
}

function parseGender(spoken: string): Gender | "" {
  const value = spoken.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  if (/\b(masculin\w*|homem|homen|male|masc)\b/.test(value)) return "Male"
  if (/\b(feminin\w*|mulher|female|fem)\b/.test(value)) return "Female"
  if (/\b(outr\w*|nao inform|prefiro n)/.test(value)) return "Other"
  return ""
}

function parseUf(spoken: string): string {
  const cleaned = spoken.toUpperCase().replace(/[^A-ZÀ-Ú\s]/g, " ").trim()
  const two = cleaned.match(/\b([A-Z]{2})\b/)
  if (two && UF_LIST.includes(two[1])) return two[1]

  const lower = spoken.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  for (const [name, uf] of Object.entries(UF_BY_SPOKEN)) {
    if (lower.includes(name)) return uf
  }
  return ""
}

function parseSpecialty(spoken: string): string {
  const lower = spoken.toLowerCase()
  const exact = SPECIALTIES.find((s) => lower.includes(s.toLowerCase()))
  if (exact) return exact

  const aliases: Record<string, string> = {
    clinica: "Clínica Geral",
    "clinica geral": "Clínica Geral",
    cardio: "Cardiologia",
    dermato: "Dermatologia",
    gineco: "Ginecologia",
    neuro: "Neurologia",
    orto: "Ortopedia",
    pediatra: "Pediatria",
    psiquiatra: "Psiquiatria",
    oftalmolog: "Oftalmologia",
    urolog: "Urologia",
    endocrino: "Endocrinologia",
    onco: "Oncologia",
  }
  for (const [key, specialty] of Object.entries(aliases)) {
    if (lower.includes(key)) return specialty
  }
  return toTitleCase(spoken)
}

function parseEmail(spoken: string): string {
  return normalizeSpokenEmail(spoken)
}

/** Normaliza a fala de um campo específico (sem IA). */
export function normalizeStaffVoiceField(
  field: StaffVoiceFieldKey,
  spoken: string,
): string | Gender {
  const raw = stripFieldPrefixes(spoken, field)
  if (!raw) return ""

  switch (field) {
    case "name":
      return toTitleCase(raw)
    case "email":
      return parseEmail(raw)
    case "phone":
    case "cpf":
    case "crmNum":
      return onlyDigits(raw)
    case "gender":
      return parseGender(raw)
    case "crmUf":
      return parseUf(raw)
    case "specialty":
      return parseSpecialty(raw)
    case "department":
      return toTitleCase(raw)
    case "password":
      return normalizeSpokenPassword(raw)
    default:
      return raw
  }
}

function buildStaffVoiceSystem(role: StaffRole): string {
  const roleLabel = role === "doctor" ? "medico" : role === "secretary" ? "secretaria" : "gestor"
  const fields = role === "doctor"
    ? "name, email, phone, gender (Male|Female|Other), cpf (somente digitos), crmNum, crmUf (sigla UF), specialty, password"
    : "name, email, phone, gender (Male|Female|Other), cpf (somente digitos), department, password"

  return [
    "Voce extrai dados de cadastro de profissionais de saude a partir de transcricao de voz em portugues do Brasil.",
    `Perfil: ${roleLabel}.`,
    `Retorne APENAS JSON com os campos: { ${fields} }.`,
    "Use null para campos ausentes. CPF, telefone e CRM apenas digitos.",
    "Corrija ortografia de nomes e especialidades quando evidente.",
    "Nao invente dados que nao foram ditos.",
  ].join(" ")
}

export function parseStaffVoiceLocal(
  lines: { field: StaffVoiceFieldKey; spoken: string }[],
  role: StaffRole,
): StaffVoiceParseResult {
  const result: StaffVoiceParseResult = {}
  for (const { field, spoken } of lines) {
    const value = normalizeStaffVoiceField(field, spoken)
    if (field === "gender") {
      if (value) result.gender = value as Gender
    } else if (typeof value === "string" && value) {
      result[field] = value
    }
  }
  if (result.password && role) {
    // confirmPassword handled in UI
  }
  return result
}

export async function parseStaffVoiceWithAI(input: {
  lines: { field: StaffVoiceFieldKey; spoken: string }[]
  role: StaffRole
  localFallback: StaffVoiceParseResult
}): Promise<StaffVoiceParseResult> {
  const transcript = input.lines
    .map(({ field, spoken }) => `${field}: ${spoken}`)
    .join("\n")

  const messages: ChatMessage[] = [
    { role: "system", content: buildStaffVoiceSystem(input.role) },
    {
      role: "user",
      content: [
        "Transcricao guiada campo a campo:",
        transcript,
        "Extraia os valores finais para o JSON.",
      ].join("\n"),
    },
  ]

  const raw = await chatComplete(messages, { temperature: 0.1, maxTokens: 700 })
  const jsonBlock = extractJsonBlock(raw)
  if (!jsonBlock) return input.localFallback

  try {
    const parsed = JSON.parse(jsonBlock) as StaffVoiceParseResult
    if (parsed.email) parsed.email = normalizeSpokenEmail(parsed.email)
    if (parsed.password) parsed.password = normalizeSpokenPassword(parsed.password)
    return { ...input.localFallback, ...parsed }
  } catch {
    return input.localFallback
  }
}

// ─────────────────────────────────────────────────────────────────
// Edge Functions de cadastro publico de paciente (Supabase).
//
//   POST /functions/v1/register-patient
//     Magic-link. Contrato de erro legado: { error, code }.
//
//   POST /functions/v1/register-patient-with-password
//     Cria o paciente ja aprovado + credencial (email/password).
//     Contrato de erro: RFC 7807 (application/problem+json) com
//     extensao { code } para os casos do dominio.
//
// Em ambas, o gateway exige `apikey` (anon). `Authorization: Bearer
// <ANON_KEY>` e enviado por compatibilidade com versoes do gateway
// que recusam preflight sem ele.
// ─────────────────────────────────────────────────────────────────

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./api"
import { onlyDigits } from "../utils"

const REQUEST_TIMEOUT_MS = 15000

const PATHS = ["/functions/v1/register-patient", "/register-patient"] as const
const PATHS_WITH_PASSWORD = [
  "/functions/v1/register-patient-with-password",
  "/register-patient-with-password",
] as const

export interface RegisterPatientRequest {
  email:         string
  full_name:     string
  phone_mobile:  string
  cpf:           string
  birth_date?:  string
  redirect_url?: string
}

export interface RegisterPatientSuccess {
  success?:     boolean
  patient_id?:  string
  user_id?:     string
  message?:     string
  email?:       string
  [key: string]: unknown
}

interface ParsedEdgeError {
  error?: string
  code?:   string
  message?: string
}

export class RegisterPatientApiError extends Error {
  readonly status: number
  readonly code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "RegisterPatientApiError"
    this.status = status
    this.code = code ? code.toUpperCase() : undefined
  }
}

function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError ||
    err instanceof DOMException ||
    (err instanceof Error && /failed to fetch|network|abort|timeout/i.test(err.message))
}

function safeJsonParse(raw: string): ParsedEdgeError {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as ParsedEdgeError
  } catch {
    return {}
  }
}

function messageForStatusAndCode(status: number, parsed: ParsedEdgeError): string {
  const code = (parsed.code ?? "").toUpperCase()
  const raw = (parsed.error ?? parsed.message ?? "").trim()

  if (code === "INVALID_CPF") {
    return "CPF inválido. Confira os números e os dígitos verificadores."
  }
  if (code === "CPF_EXISTS") {
    return "Este CPF já está cadastrado."
  }
  if (code === "EMAIL_EXISTS") {
    return "Este e-mail já está em uso."
  }
  if (code === "RATE_LIMIT_EXCEEDED") {
    return "Muitas tentativas de cadastro a partir desta rede. Aguarde cerca de uma hora e tente novamente."
  }
  if (code === "VALIDATION_ERROR") {
    return raw || "Dados inválidos. Verifique os campos e tente novamente."
  }
  if (status === 429) {
    return raw || "Muitas requisições. Aguarde alguns instantes e tente novamente."
  }
  if (status === 409) {
    return raw || "Já existe um cadastro com estes dados."
  }
  if (status === 400) {
    return raw || "Não foi possível concluir o cadastro. Verifique os dados informados."
  }
  return raw || `Erro ao cadastrar (${status}).`
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    })
  } finally {
    window.clearTimeout(timeoutId)
  }
}

/**
 * Chama a Edge Function `register-patient` com o contrato oficial.
 * Em erro, lança {@link RegisterPatientApiError} com `code` quando a API enviar.
 */
export async function invokeRegisterPatient(
  input: RegisterPatientRequest,
  signal?: AbortSignal,
): Promise<RegisterPatientSuccess> {
  const email = input.email.trim().toLowerCase()
  const full_name = input.full_name.trim()
  const phone_mobile = onlyDigits(input.phone_mobile)
  const cpf = onlyDigits(input.cpf)
  const body: Record<string, string> = {
    email,
    full_name,
    phone_mobile,
    cpf,
  }
  if (input.birth_date?.trim()) body.birth_date = input.birth_date.trim()
  if (input.redirect_url?.trim()) body.redirect_url = input.redirect_url.trim()

  let last404 = false
  for (const path of PATHS) {
    let res: Response
    try {
      res = await fetchWithTimeout(`${SUPABASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "apikey":        SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      })
    } catch (err) {
      if (isNetworkFailure(err)) {
        throw new RegisterPatientApiError(
          "Não foi possível conectar ao servidor. Verifique sua rede e tente novamente.",
          0,
        )
      }
      throw err
    }

    if (res.status === 404) {
      last404 = true
      continue
    }

    const raw = await res.text().catch(() => "")
    const parsed = safeJsonParse(raw)

    if (!res.ok) {
      throw new RegisterPatientApiError(
        messageForStatusAndCode(res.status, parsed),
        res.status,
        parsed.code,
      )
    }

    try {
      return raw ? JSON.parse(raw) as RegisterPatientSuccess : { success: true }
    } catch {
      return { success: true, message: "Cadastro realizado." }
    }
  }

  if (last404) {
    throw new RegisterPatientApiError(
      "Função register-patient não encontrada neste projeto Supabase.",
      404,
    )
  }
  throw new RegisterPatientApiError("Função register-patient não encontrada.", 404)
}

export function isRegisterPatientConflict(err: RegisterPatientApiError): boolean {
  return err.status === 409 && ["CPF_EXISTS", "EMAIL_EXISTS"].includes(err.code ?? "")
}

// ─────────────────────────────────────────────────────────────────
// register-patient-with-password (RFC 7807 / Problem Details)
// ─────────────────────────────────────────────────────────────────

export interface RegisterPatientWithPasswordRequest {
  email:        string
  password:     string
  full_name:    string
  phone_mobile: string
  cpf:          string
  birth_date?: string
}

/** Problem Details (RFC 7807) com extensoes do dominio. */
interface ProblemDetails {
  type?:     string
  title?:    string
  status?:   number
  detail?:   string
  instance?: string
  code?:     string
  errors?:   Record<string, string[] | string> | string[]
  // Fallbacks defensivos para servidores que misturam formatos.
  error?:    string
  message?:  string
}

function safeJsonParseProblem(raw: string): ProblemDetails {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as ProblemDetails
  } catch {
    return {}
  }
}

function summarizeProblemErrors(errors: ProblemDetails["errors"]): string {
  if (!errors) return ""
  if (Array.isArray(errors)) return errors.filter(Boolean).join(" ")
  return Object.entries(errors)
    .map(([field, val]) => {
      const text = Array.isArray(val) ? val.join(", ") : val
      return text ? `${field}: ${text}` : ""
    })
    .filter(Boolean)
    .join(" | ")
}

function messageForProblem(status: number, p: ProblemDetails): string {
  const code = (p.code ?? "").toUpperCase()
  const raw = (p.detail ?? p.title ?? p.error ?? p.message ?? "").trim()
  const validationSummary = summarizeProblemErrors(p.errors)

  if (code === "INVALID_CPF" || /cpf.*inv[aá]lid|invalid.*cpf/i.test(raw)) {
    return "CPF inválido. Confira os números e os dígitos verificadores."
  }
  if (code === "CPF_EXISTS") {
    return "Este CPF já está cadastrado."
  }
  if (code === "EMAIL_EXISTS") {
    return "Este e-mail já está em uso."
  }
  if (code === "RATE_LIMIT_EXCEEDED" || status === 429) {
    return raw || "Muitas tentativas de cadastro a partir desta rede. Aguarde alguns minutos e tente novamente."
  }
  if (code === "VALIDATION_ERROR" || status === 400) {
    return validationSummary || raw || "Dados inválidos. Verifique os campos e tente novamente."
  }
  if (status === 409) {
    return raw || "Já existe um cadastro com estes dados."
  }
  if (status >= 500) {
    return raw || "Erro interno do servidor. Tente novamente em instantes."
  }
  return raw || `Erro ao cadastrar (${status}).`
}

/**
 * Chama `register-patient-with-password`. Em erro, lança
 * {@link RegisterPatientApiError} traduzido a partir do Problem Details.
 */
export async function invokeRegisterPatientWithPassword(
  input: RegisterPatientWithPasswordRequest,
  signal?: AbortSignal,
): Promise<RegisterPatientSuccess> {
  const email = input.email.trim().toLowerCase()
  const full_name = input.full_name.trim()
  const phone_mobile = onlyDigits(input.phone_mobile)
  const cpf = onlyDigits(input.cpf)
  const password = input.password

  if (password.length < 6) {
    throw new RegisterPatientApiError(
      "A senha deve ter pelo menos 6 caracteres.",
      400,
      "VALIDATION_ERROR",
    )
  }

  const body: Record<string, string> = {
    email,
    password,
    full_name,
    phone_mobile,
    cpf,
  }
  if (input.birth_date?.trim()) body.birth_date = input.birth_date.trim()

  let last404 = false
  for (const path of PATHS_WITH_PASSWORD) {
    let res: Response
    try {
      res = await fetchWithTimeout(`${SUPABASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "apikey":        SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          "Accept":        "application/json, application/problem+json",
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      })
    } catch (err) {
      if (isNetworkFailure(err)) {
        throw new RegisterPatientApiError(
          "Não foi possível conectar ao servidor. Verifique sua rede e tente novamente.",
          0,
        )
      }
      throw err
    }

    if (res.status === 404) {
      last404 = true
      continue
    }

    const raw = await res.text().catch(() => "")
    const parsed = safeJsonParseProblem(raw)

    if (!res.ok) {
      throw new RegisterPatientApiError(
        messageForProblem(res.status, parsed),
        res.status,
        parsed.code,
      )
    }

    try {
      return raw ? JSON.parse(raw) as RegisterPatientSuccess : { success: true }
    } catch {
      return { success: true, message: "Cadastro realizado." }
    }
  }

  throw new RegisterPatientApiError(
    last404
      ? "Função register-patient-with-password não encontrada neste projeto Supabase."
      : "Função register-patient-with-password não encontrada.",
    404,
  )
}

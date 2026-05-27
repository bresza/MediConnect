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
// Em ambas, o gateway exige `apikey` (anon). As funcoes sao publicas
// (`verify_jwt` desativado), sem necessidade de JWT de sessao.
// ─────────────────────────────────────────────────────────────────

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./api"
import { messageFromProblemDetails, parseProblemDetails, type ProblemDetails } from "./problemDetails"
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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
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

  if (!email || !isValidEmail(email)) {
    throw new RegisterPatientApiError("E-mail inválido.", 400, "VALIDATION_ERROR")
  }
  if (full_name.length < 3) {
    throw new RegisterPatientApiError("Nome completo deve ter ao menos 3 caracteres.", 400, "VALIDATION_ERROR")
  }
  if (!/^\d{10,11}$/.test(phone_mobile)) {
    throw new RegisterPatientApiError("Telefone deve conter 10 ou 11 dígitos numéricos.", 400, "VALIDATION_ERROR")
  }
  if (!/^\d{11}$/.test(cpf)) {
    throw new RegisterPatientApiError("CPF deve conter 11 dígitos numéricos.", 400, "VALIDATION_ERROR")
  }

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
          "Accept":        "application/json, application/problem+json",
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

function messageForProblem(status: number, p: ProblemDetails): string {
  const mapped = messageFromProblemDetails(status, p)
  if (mapped) return mapped
  if (status === 409) return "Já existe um cadastro com estes dados."
  return `Erro ao cadastrar (${status}).`
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
    const parsed = parseProblemDetails(raw)

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

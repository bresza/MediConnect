import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CONFIG_ERROR } from "./api"
import {
  invokeRegisterPatient,
  invokeRegisterPatientWithPassword,
  isRegisterPatientConflict,
  RegisterPatientApiError,
} from "./registerPatient"
import { messageFromProblemDetails, parseProblemDetails } from "./problemDetails"
import { fetchUserInfo, resolvePatientIdFromApi } from "./userInfo"
import { syncPatientAuthLink } from "./patients"
import { resolveLoginRole } from "./loginRole"
import { isValidCpf } from "../utils"
import type { User } from "../types"

function assertSupabaseConfigured(): void {
  if (SUPABASE_CONFIG_ERROR) throw new Error(SUPABASE_CONFIG_ERROR)
}

export async function logoutSession(token: string): Promise<void> {
  if (!token || token.startsWith("local-")) return

  const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
  })

  if (res.status === 401) return
  if (res.status !== 204 && !res.ok) {
    const raw = await res.text().catch(() => "")
    throw new Error(raw || "Não foi possível encerrar a sessão no servidor.")
  }
}

/** Verifica se e-mail+senha autenticam (sem montar sessão completa). */
export async function verifyPatientCredentials(email: string, password: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Motivo legível quando grant_type=password falha. */
export async function explainPasswordLoginFailure(
  email: string,
  password: string,
): Promise<string> {
  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() }),
    })
    if (res.ok) return ""
    const err = await res.json().catch(() => ({})) as Record<string, string>
    const message = err?.error_description ?? err?.message ?? err?.msg ?? ""
    const code = (err?.error ?? err?.code ?? "").toString().toLowerCase()
    if (/email not confirmed|confirm/i.test(message) || code === "email_not_confirmed") {
      return "A conta existe, mas o e-mail ainda não foi confirmado. Verifique a caixa de entrada ou peça nova senha em «Esqueci minha senha»."
    }
    if (/invalid login|invalid.*credential|invalid.*password|invalid_grant/i.test(`${message} ${code}`)) {
      return "E-mail ou senha não conferem com o cadastro no servidor. Peça à secretária para salvar de novo o acesso ao portal no cadastro do paciente ou use «Esqueci minha senha»."
    }
    return message || "Login recusado pelo servidor de autenticação."
  } catch {
    return "Não foi possível testar o login agora. Verifique sua conexão e tente de novo."
  }
}

async function fetchUserRoleNames(token: string, userId: string): Promise<string[]> {
  if (!userId) return []
  try {
    const res = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&select=role`,
      {
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${token}`,
        },
      },
    )
    if (!res.ok) return []
    const rows = await res.json().catch(() => []) as Array<{ role?: string }>
    return Array.isArray(rows) ? rows.map((r) => r.role).filter((r): r is string => Boolean(r)) : []
  } catch {
    return []
  }
}

/** Revalida papel após login salvo em localStorage (corrige sessão com role errado). */
export async function reconcileUserRole(token: string, user: User): Promise<User> {
  if (!token || token.startsWith("local-")) return user

  const [info, userRoleRows, profileFallback] = await Promise.all([
    fetchUserInfo(token),
    fetchUserRoleNames(token, user.id),
    fetchProfileFallback(token, user.id, user.email),
  ])
  const profile = info?.profile ?? profileFallback

  const linkedPatient = user.role === "patient"
    ? await fetchPatientLink(token, user.id, user.email, user.patientCpf, user.patientId)
    : null

  const role = resolveLoginRole({
    roles: info?.roles ?? [],
    profileRole: profile?.role,
    userRoleRows,
    permissions: info?.permissions,
    linkedPatient,
    hasCrm: Boolean(profile?.crm ?? user.crm),
  })

  const isPatientLogin = role === "patient"
  return {
    ...user,
    role,
    name: profile?.full_name ?? user.name,
    crm: profile?.crm ?? user.crm,
    specialty: profile?.specialty ?? user.specialty,
    patientId: isPatientLogin ? (user.patientId ?? profile?.patient_id) : undefined,
    patientCpf: isPatientLogin ? user.patientCpf : undefined,
    phone: profile?.phone ?? user.phone,
  }
}

export { resolveLoginRole } from "./loginRole"

export interface LoginPayload  { email: string; password: string }
export interface PatientSignupPayload {
  name: string
  email: string
  /** Opcional no fluxo magic link; obrigatoria no fallback `create-user-with-password` ou vinculo a paciente existente. */
  password?: string
  cpf: string
  phone: string
  dob?: string
}
export interface PatientSignupResponse {
  success: boolean
  patient_id?: string
  user_id?: string
  message?: string
  email?: string
  /** True quando a conta foi criada via `register-patient` (link no e-mail). */
  magicLinkSent?: boolean
  /** True quando o cadastro ja saiu pronto para login direto (senha definida). */
  loginReady?: boolean
}
export interface LoginResponse {
  user: User; token: string; clinicId: string; clinicName: string
  refreshToken: string | null
  expiresAt: number | null
}

export interface RefreshSessionResponse {
  token: string
  refreshToken: string | null
  expiresAt: number | null
}
export interface PasswordResetResponse {
  success: boolean
  message: string
}

const AUTH_TIMEOUT_MS = 15000

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "")
}

function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError ||
    err instanceof DOMException ||
    (err instanceof Error && /failed to fetch|network|abort|timeout/i.test(err.message))
}

function connectionMessage(): string {
  return "Não foi possível conectar ao Supabase configurado. Verifique se o projeto está ativo, se a URL em .env está correta e se sua rede permite acesso a supabase.co."
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS)
  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    })
  } catch (err) {
    if (isNetworkFailure(err)) throw new Error(connectionMessage())
    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function localDevLogin(payload: LoginPayload): LoginResponse | null {
  if (!import.meta.env.DEV) return null

  const email = payload.email.trim().toLowerCase()
  if (!payload.password.trim()) return null

  const devUsers: Record<string, User> = {
    "cabello.camila@popcode.com": {
      id: "local-doctor-camila",
      doctorId: "local-doctor-camila",
      name: "Dra. Camila Cabello",
      role: "doctor",
      email,
      crm: "00000-SE",
      specialty: "Clínica Geral",
    },
    "carla@mediconnect.com": {
      id: "local-doctor-carla",
      doctorId: "local-doctor-carla",
      name: "Dra. Carla Nunes",
      role: "doctor",
      email,
      crm: "67890-SE",
      specialty: "Cardiologia",
    },
    "roberto@mediconnect.com": {
      id: "local-doctor-roberto",
      doctorId: "local-doctor-roberto",
      name: "Dr. Roberto Farias",
      role: "doctor",
      email,
      crm: "12345-SE",
      specialty: "Clínica Geral",
    },
  }

  const user = devUsers[email]
  if (!user) return null

  return {
    user,
    token: `local-dev:${user.role}:${email}`,
    clinicId: "local",
    clinicName: "MediConnect",
    refreshToken: null,
    expiresAt: null,
  }
}

function expiresAtFromSeconds(expiresIn?: number | null): number | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) return null
  return Date.now() + expiresIn * 1000
}

export async function refreshSession(refreshToken: string): Promise<RefreshSessionResponse> {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error_description ?? err?.message ?? "Sessão expirada. Faça login novamente.")
  }

  const data = await res.json() as Partial<SupabaseAuthResponse>
  return {
    token: data.access_token ?? "",
    refreshToken: data.refresh_token ?? null,
    expiresAt: expiresAtFromSeconds(data.expires_in),
  }
}

export async function createPatientAccount(payload: PatientSignupPayload): Promise<PatientSignupResponse> {
  const name = payload.name.trim()
  const email = payload.email.trim().toLowerCase()
  const password = (payload.password ?? "").trim()
  const cpf = onlyDigits(payload.cpf)
  const phone = onlyDigits(payload.phone)

  if (!name) throw new Error("Informe seu nome completo.")
  if (!email) throw new Error("Informe seu e-mail.")
  if (password && password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")
  if (cpf.length !== 11) throw new Error("Informe um CPF válido com 11 dígitos.")
  if (!isValidCpf(cpf)) throw new Error("CPF inválido. Confira os números e os dígitos verificadores.")
  if (!phone) throw new Error("Informe seu telefone.")

  if (password.length >= 6) {
    return createPatientAccountWithPassword({
      name, email, password, cpf, phone, dob: payload.dob,
    })
  }

  return createPatientAccountMagicLink({
    name, email, cpf, phone, dob: payload.dob,
  })
}

interface CreatePatientMagicLinkInput {
  name:  string
  email: string
  cpf:   string
  phone: string
  dob?:  string
}

async function createPatientAccountMagicLink(input: CreatePatientMagicLinkInput): Promise<PatientSignupResponse> {
  const redirect_url = typeof window !== "undefined" ? window.location.origin : undefined
  try {
    const data = await invokeRegisterPatient({
      email: input.email,
      full_name: input.name,
      phone_mobile: input.phone,
      cpf: input.cpf,
      birth_date: input.dob || undefined,
      redirect_url,
    })

    return {
      success: data?.success ?? true,
      patient_id: typeof data?.patient_id === "string" ? data.patient_id : undefined,
      user_id:    typeof data?.user_id === "string" ? data.user_id : undefined,
      email:      (typeof data?.email === "string" ? data.email : null) ?? input.email,
      message:
        (typeof data?.message === "string" ? data.message : null) ??
        "Enviamos um link de acesso para o seu e-mail. Abra a mensagem para concluir o primeiro acesso.",
      magicLinkSent: true,
    }
  } catch (err) {
    if (!(err instanceof RegisterPatientApiError)) throw err

    if (isRegisterPatientConflict(err)) {
      throw new Error(
        `${err.message} Se você já tem cadastro na clínica sem acesso ao portal, defina uma senha nos campos abaixo e tente de novo. ` +
        "Caso já tenha senha, use «Esqueci minha senha» na aba Entrar.",
      )
    }
    if (err.status === 404) {
      throw new Error(
        "Cadastro por e-mail não está disponível neste ambiente. Defina uma senha para tentar o fluxo alternativo.",
      )
    }
    throw new Error(err.message)
  }
}

async function createPatientAccountWithPassword(input: ClaimPatientInput): Promise<PatientSignupResponse> {
  try {
    const data = await invokeRegisterPatientWithPassword({
      email:        input.email,
      password:     input.password,
      full_name:    input.name,
      phone_mobile: input.phone,
      cpf:          input.cpf,
      birth_date:   input.dob || undefined,
    })

    return {
      success: data?.success ?? true,
      patient_id: typeof data?.patient_id === "string" ? data.patient_id : undefined,
      user_id:    typeof data?.user_id === "string" ? data.user_id : undefined,
      email:      (typeof data?.email === "string" ? data.email : null) ?? input.email,
      message:
        (typeof data?.message === "string" ? data.message : null) ??
        "Conta criada com sucesso. Entrando…",
      loginReady: true,
    }
  } catch (err) {
    if (!(err instanceof RegisterPatientApiError)) throw err

    if (isRegisterPatientConflict(err)) {
      return claimExistingPatientAccount(input)
    }

    if (err.status === 404) {
      return createPatientViaGenericEndpoint(input)
    }

    throw new Error(err.message)
  }
}

// Fallback: cria conta de paciente via /functions/v1/create-user-with-password
// quando register-patient nao esta disponivel no projeto.
async function createPatientViaGenericEndpoint(input: ClaimPatientInput): Promise<PatientSignupResponse> {
  const payload = {
    email:     input.email,
    password:  input.password,
    full_name: input.name,
    phone:     input.phone || undefined,
    cpf:       input.cpf,
    role:      "paciente",
  }

  async function post(path: string): Promise<Response> {
    return fetchWithTimeout(`${SUPABASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Accept":        "application/json, application/problem+json",
        "apikey":        SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    })
  }

  let res = await post("/functions/v1/create-user-with-password")
  if (res.status === 404) res = await post("/create-user-with-password")

  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    const problem = parseProblemDetails(raw)
    const parsed = safeJsonParse(raw)

    if (isExistingAuthUserError(parsed) || isExistingAuthUserError(problem)) {
      throw new Error(
        "Este e-mail já possui acesso ao portal. Use a opção \"Esqueci minha senha\" para redefinir o acesso.",
      )
    }

    if (isExistingPatientError(parsed) || isExistingPatientError(problem)) {
      return claimExistingPatientAccount(input)
    }

    const message =
      messageFromProblemDetails(res.status, problem) ||
      readableError(parsed) ||
      raw ||
      "Não foi possível criar sua conta. Verifique os dados e tente novamente."
    throw new Error(message)
  }

  const data = await res.json().catch(() => null) as Partial<{
    user_id: string
    user: { id?: string; email?: string }
    patient_id: string
    profile: { patient_id?: string }
    message: string
  }> | null

  return {
    success: true,
    user_id: data?.user_id ?? data?.user?.id,
    patient_id: data?.patient_id ?? data?.profile?.patient_id,
    email: data?.user?.email ?? input.email,
    message: data?.message ?? "Conta criada com sucesso. Entre com seu e-mail e senha.",
  }
}

interface ParsedError {
  code?: string
  error?: string
  message?: string
  detail?: string
  error_description?: string
  msg?: string
  title?: string
  type?: string
  errors?: Record<string, string[] | string> | string[]
}

function safeJsonParse(raw: string): ParsedError {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as ParsedError
  } catch {
    return {}
  }
}

function readableError(parsed: ParsedError): string | undefined {
  return parsed.detail ?? parsed.message ?? parsed.error_description ?? parsed.msg ?? parsed.title ?? parsed.error
}

// Detecta os codigos/mensagens que a API retorna quando o paciente ja consta no cadastro
// (CPF ou e-mail), mas ainda nao possui credencial de acesso ao portal.
function isExistingPatientError(parsed: ParsedError): boolean {
  const code = (parsed.code ?? "").toUpperCase()
  if (["CPF_EXISTS", "EMAIL_EXISTS", "PATIENT_EXISTS", "PATIENT_ALREADY_EXISTS"].includes(code)) return true
  if ((parsed.type ?? "").includes("conflict")) return true

  const text = `${parsed.error ?? ""} ${parsed.message ?? ""} ${parsed.detail ?? ""}`.toLowerCase()
  return /cpf.*j[aá].*cadastrad|e-?mail.*j[aá].*cadastrad|paciente.*j[aá].*cadastrad|patient.*already/i.test(text)
}

function isExistingAuthUserError(parsed: ParsedError): boolean {
  const text = `${parsed.error ?? ""} ${parsed.message ?? ""} ${parsed.detail ?? ""} ${parsed.error_description ?? ""}`.toLowerCase()
  return /already.*registered|already.*exists|user.*exists|email.*j[aá].*cadastrad|usu[aá]rio.*existe/i.test(text)
}

interface ClaimPatientInput {
  name: string
  email: string
  password: string
  cpf: string
  phone: string
  dob?: string
}

// Cria credencial para paciente ja cadastrado (vinculo por CPF/e-mail no backend).
async function claimExistingPatientAccount(input: ClaimPatientInput): Promise<PatientSignupResponse> {
  const payload = {
    email:     input.email,
    password:  input.password,
    full_name: input.name,
    phone:     input.phone || undefined,
    cpf:       input.cpf,
    role:      "paciente",
  }

  async function post(path: string): Promise<Response> {
    return fetchWithTimeout(`${SUPABASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Accept":        "application/json, application/problem+json",
        "apikey":        SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    })
  }

  let res = await post("/functions/v1/create-user-with-password")
  if (res.status === 404) res = await post("/create-user-with-password")

  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    const problem = parseProblemDetails(raw)
    const parsed = safeJsonParse(raw)

    if (isExistingAuthUserError(parsed) || isExistingAuthUserError(problem)) {
      throw new Error(
        "Este e-mail já possui acesso ao portal. Use a opção \"Esqueci minha senha\" para redefinir o acesso.",
      )
    }

    const message =
      messageFromProblemDetails(res.status, problem) ||
      readableError(parsed) ||
      raw ||
      "Não foi possível criar o acesso para este paciente."
    throw new Error(message)
  }

  const data = await res.json().catch(() => null) as Partial<{
    user_id: string
    user: { id?: string; email?: string }
    patient_id: string
    profile: { patient_id?: string }
    message: string
  }> | null

  return {
    success: true,
    user_id: data?.user_id ?? data?.user?.id,
    patient_id: data?.patient_id ?? data?.profile?.patient_id,
    email: data?.user?.email ?? input.email,
    message:
      data?.message ??
      "Cadastro já existente — criamos seu acesso ao portal. Entre com seu e-mail e senha.",
  }
}

async function requestPasswordResetAt(path: string, email: string): Promise<Response> {
  return fetchWithTimeout(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      redirect_url: window.location.origin,
      // O endpoint nativo /auth/v1/recover usa `redirect_to` em vez de `redirect_url`,
      // entao mandamos ambos.
      redirect_to: window.location.origin,
    }),
  })
}

/**
 * Solicita o e-mail de recuperacao de senha tentando, em ordem:
 *  1) Edge Function customizada `/functions/v1/request-password-reset`
 *  2) Alias curto `/request-password-reset` (projetos antigos)
 *  3) Endpoint nativo do Supabase Auth `/auth/v1/recover` (sempre disponivel)
 *
 * Se a Edge Function falhar com erro de rede/CORS/404, caimos automaticamente
 * no endpoint nativo para que o reset funcione mesmo sem Edge Function publicada.
 */
export async function requestPasswordReset(emailInput: string): Promise<PasswordResetResponse> {
  const email = emailInput.trim().toLowerCase()
  if (!email) throw new Error("Informe seu e-mail.")

  // Tentativa 1: Edge Function customizada.
  let res: Response | null = null
  try {
    res = await requestPasswordResetAt("/functions/v1/request-password-reset", email)
    if (res.status === 404) {
      res = await requestPasswordResetAt("/request-password-reset", email)
    }
  } catch {
    res = null // erro de rede/CORS — cai no fallback nativo
  }

  if (res && res.ok) {
    const data = await res.json().catch(() => null) as Partial<PasswordResetResponse> | null
    return {
      success: data?.success ?? true,
      message: data?.message ?? "E-mail de recuperação enviado. Verifique sua caixa de entrada.",
    }
  }

  // Tentativa 2: endpoint nativo do Supabase Auth (sempre disponivel).
  let nativeRes: Response
  try {
    nativeRes = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/recover`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email,
        redirect_to: window.location.origin,
      }),
    })
  } catch (err) {
    if (isNetworkFailure(err)) throw new Error(connectionMessage())
    throw err
  }

  if (!nativeRes.ok) {
    const raw = await nativeRes.text().catch(() => "")
    let message = raw || "Não foi possível enviar o e-mail de recuperação."
    try {
      const parsed = JSON.parse(raw)
      message = parsed?.detail ?? parsed?.message ?? parsed?.error_description ?? parsed?.msg ?? parsed?.title ?? message
    } catch { /* nao e json */ }
    throw new Error(message)
  }

  return {
    success: true,
    message: "E-mail de recuperação enviado. Verifique sua caixa de entrada (e a pasta de spam).",
  }
}

function normalizeRole(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function mapGender(value?: string | null): User["gender"] {
  const normalized = normalizeRole(value)
  if (normalized.startsWith("masc") || ["male", "masculino", "m", "homem"].includes(normalized)) return "Male"
  if (normalized.startsWith("fem") || ["female", "feminino", "f", "mulher"].includes(normalized)) return "Female"
  if (normalized.startsWith("out") || ["other", "outro", "nao_binario", "nao-binario", "nonbinary", "non-binary"].includes(normalized)) return "Other"
  return undefined
}

interface SupabaseAuthResponse {
  access_token: string; token_type: string
  expires_in: number; refresh_token: string
  user: { id: string; email: string }
}

interface ProfileResponse {
  id?: string
  full_name?: string
  email?: string
  phone?: string
  role?: string
  crm?: string
  specialty?: string
  cpf?: string
  patient_id?: string
  gender?: string
  sex?: string
}

interface PatientLinkResponse {
  id: string
  user_id?: string
  cpf?: string
  email?: string
  phone_mobile?: string
  birth_date?: string
}

interface DoctorLinkResponse {
  id: string
  email?: string
  full_name?: string
  crm?: string
  crm_uf?: string
  crm_state?: string
  specialty?: string
}

interface StaffOperationalLinkResponse {
  id?: string
  user_id?: string
  full_name?: string
  email?: string
  phone?: string
  phone_mobile?: string
  cpf?: string
  gender?: string
  sex?: string
}

async function fetchProfileFallback(token: string, userId: string, email: string): Promise<ProfileResponse | null> {
  const query = `or=(id.eq.${encodeURIComponent(userId)},email.eq.${encodeURIComponent(email)})&select=*`
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/profiles?${query}`, {
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => [])
  return Array.isArray(data) ? data[0] ?? null : null
}

async function fetchPatientLink(
  token: string,
  userId: string,
  email: string,
  cpf?: string,
  patientId?: string,
): Promise<PatientLinkResponse | null> {
  const filters = [
    patientId ? `id.eq.${encodeURIComponent(patientId)}` : "",
    userId ? `user_id.eq.${encodeURIComponent(userId)}` : "",
    userId ? `id.eq.${encodeURIComponent(userId)}` : "",
    email ? `email.eq.${encodeURIComponent(email)}` : "",
    cpf ? `cpf.eq.${encodeURIComponent(onlyDigits(cpf))}` : "",
  ].filter(Boolean)
  if (filters.length === 0) return null

  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/patients?or=(${filters.join(",")})&select=id,cpf,email,phone_mobile,birth_date&limit=1`, {
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => [])
  return Array.isArray(data) ? data[0] ?? null : null
}

async function fetchDoctorLink(
  token: string,
  userId: string,
  email: string,
  name?: string,
): Promise<DoctorLinkResponse | null> {
  const filters = [
    userId ? `id.eq.${encodeURIComponent(userId)}` : "",
    email ? `email.eq.${encodeURIComponent(email)}` : "",
    name ? `full_name.eq.${encodeURIComponent(name)}` : "",
  ].filter(Boolean)
  if (filters.length === 0) return null

  // crm_state e legado de schemas antigos: o select pede apenas crm_uf.
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/doctors?or=(${filters.join(",")})&select=id,email,full_name,crm,crm_uf&limit=1`, {
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => [])
  return Array.isArray(data) ? data[0] ?? null : null
}

async function withPatientLink(user: User, token: string): Promise<User> {
  if (user.role !== "patient") return user

  const linkedId = await resolvePatientIdFromApi(token)
  const candidateId = linkedId ?? user.patientId

  if (candidateId && user.id) {
    const confirmed = await syncPatientAuthLink(candidateId, user.id, user.email).catch(() => null)
    if (confirmed) {
      user = { ...user, patientId: confirmed }
    }
  }

  const patient = await fetchPatientLink(
    token,
    user.id,
    user.email,
    user.patientCpf,
    user.patientId ?? linkedId ?? undefined,
  )
  if (!patient) {
    return {
      ...user,
      patientId: user.patientId ?? linkedId ?? undefined,
    }
  }
  return {
    ...user,
    patientId: patient.id,
    patientCpf: patient.cpf ? onlyDigits(patient.cpf) : user.patientCpf,
    phone: patient.phone_mobile ?? user.phone,
    dob: patient.birth_date ?? user.dob,
  }
}

async function withDoctorLink(user: User, token: string): Promise<User> {
  if (user.role !== "doctor") return user
  const doctor = await fetchDoctorLink(token, user.id, user.email, user.name)
  if (!doctor) return user
  const crmUf = doctor.crm_uf ?? doctor.crm_state ?? ""
  return {
    ...user,
    doctorId: doctor.id,
    name: doctor.full_name ?? user.name,
    crm: doctor.crm ? `${doctor.crm}${crmUf ? `-${crmUf}` : ""}` : user.crm,
    specialty: doctor.specialty ?? user.specialty,
  }
}

async function fetchStaffOperationalLink(
  token: string,
  table: "secretaries" | "managers",
  userId: string,
  email: string,
): Promise<StaffOperationalLinkResponse | null> {
  const filters = [
    userId ? `user_id.eq.${encodeURIComponent(userId)}` : "",
    userId ? `id.eq.${encodeURIComponent(userId)}` : "",
    email ? `email.eq.${encodeURIComponent(email)}` : "",
  ].filter(Boolean)
  if (filters.length === 0) return null

  const filterQuery = `or=(${filters.join(",")})&limit=1`
  const headers = {
    "Content-Type":  "application/json",
    "apikey":        SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
  }

  let res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/${table}?${filterQuery}&select=user_id,full_name,email,phone,cpf,gender,sex`,
    { headers },
  )
  if (!res.ok) {
    res = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/${table}?${filterQuery}&select=user_id,full_name,email,phone,cpf`,
      { headers },
    )
  }
  if (!res.ok) return null
  const data = await res.json().catch(() => [])
  return Array.isArray(data) ? data[0] ?? null : null
}

async function withStaffLink(user: User, token: string): Promise<User> {
  if (user.role !== "secretary" && user.role !== "manager") return user

  const table = user.role === "secretary" ? "secretaries" : "managers"
  const row = await fetchStaffOperationalLink(token, table, user.id, user.email)
  if (!row) return user

  const phone = row.phone?.trim() || row.phone_mobile?.trim()
  return {
    ...user,
    name: row.full_name?.trim() || user.name,
    phone: phone || user.phone,
    gender: mapGender(row.gender ?? row.sex) ?? user.gender,
  }
}

async function withRoleLinks(user: User, token: string): Promise<User> {
  const linked = await withPatientLink(user, token)
  const withDoctor = await withDoctorLink(linked, token)
  return withStaffLink(withDoctor, token)
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  assertSupabaseConfigured()
  // Passo 1 — autenticar. Usamos sempre email/senha em formato normalizado
  // (trim + lowercase no email) para evitar falhas por espaços invisiveis.
  const normalizedEmail    = payload.email.trim().toLowerCase()
  const normalizedPassword = payload.password.trim()

  let authRes: Response
  try {
    authRes = await fetchWithTimeout(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: normalizedEmail, password: normalizedPassword }),
      },
    )
  } catch (err) {
    const local = localDevLogin({ email: normalizedEmail, password: normalizedPassword })
    if (local) return local
    throw err
  }

  if (!authRes.ok) {
    const err = await authRes.json().catch(() => ({}))
    const message = err?.error_description ?? err?.message ?? err?.msg ?? ""
    const code    = (err?.error ?? err?.code ?? "").toString().toLowerCase()
    if (/email not confirmed|confirm/i.test(message) || code === "email_not_confirmed") {
      throw new Error(
        "Sua conta ainda não foi confirmada. Verifique seu e-mail e clique no link de confirmação.",
      )
    }
    if (/invalid login|invalid.*credential|invalid.*password|invalid_grant/i.test(`${message} ${code}`)) {
      const detail = await explainPasswordLoginFailure(normalizedEmail, normalizedPassword)
      throw new Error(detail || "E-mail ou senha inválidos.")
    }
    throw new Error(message || "E-mail ou senha inválidos.")
  }

  const authData: SupabaseAuthResponse = await authRes.json()
  const info = await fetchUserInfo(authData.access_token)

  let profile = info?.profile ?? null
  if (!profile) {
    profile = await fetchProfileFallback(authData.access_token, authData.user.id, authData.user.email)
  }

  const resolvedUserId = (info?.user?.id ?? authData.user.id).trim()
  const resolvedEmail = (info?.user?.email ?? authData.user.email).trim().toLowerCase()

  const [userRoleRows, patient] = await Promise.all([
    fetchUserRoleNames(authData.access_token, resolvedUserId),
    fetchPatientLink(
      authData.access_token,
      resolvedUserId,
      resolvedEmail,
      profile?.cpf,
      profile?.patient_id,
    ),
  ])

  const role = resolveLoginRole({
    roles: info?.roles ?? [],
    profileRole: profile?.role,
    userRoleRows,
    permissions: info?.permissions,
    linkedPatient: patient,
    hasCrm: Boolean(profile?.crm),
  })
  const isPatientLogin = role === "patient"

  const user: User = {
    id: resolvedUserId,
    name: profile?.full_name ?? resolvedEmail,
    role,
    email: profile?.email ?? (isPatientLogin ? patient?.email : undefined) ?? resolvedEmail,
    crm: profile?.crm,
    specialty: profile?.specialty,
    gender: mapGender(profile?.gender ?? profile?.sex),
    patientCpf: isPatientLogin
      ? (patient?.cpf ? onlyDigits(patient.cpf) : profile?.cpf ? onlyDigits(profile.cpf) : undefined)
      : undefined,
    patientId: isPatientLogin ? (patient?.id ?? profile?.patient_id) : undefined,
    phone: (isPatientLogin ? patient?.phone_mobile : undefined) ?? profile?.phone,
    dob: isPatientLogin ? patient?.birth_date : undefined,
  }

  return {
    user: await withRoleLinks(user, authData.access_token),
    token: authData.access_token,
    clinicId: "default",
    clinicName: "MediConnect",
    refreshToken: authData.refresh_token ?? null,
    expiresAt: expiresAtFromSeconds(authData.expires_in),
  }
}

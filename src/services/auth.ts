import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CONFIG_ERROR, apiRequest, ApiError } from "./api"
import {
  invokeRegisterPatientWithPassword,
  isRegisterPatientConflict,
  RegisterPatientApiError,
} from "./registerPatient"
import { messageFromProblemDetails, parseProblemDetails } from "./problemDetails"
import { isValidCpf, isValidEmail } from "../utils"
import { translateApiError } from "../utils/apiErrors"
import type { User, UserRole } from "../types"
import { avatarUrlForUser, normalizeAvatarUrl } from "./patientPhoto"

type ApiUserRole = "admin" | "gestor" | "medico" | "secretaria" | "paciente" | "user"

function assertSupabaseConfigured(): void {
  if (SUPABASE_CONFIG_ERROR) throw new Error(SUPABASE_CONFIG_ERROR)
}

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
export interface UserInfoByIdResponse {
  user?: {
    id?: string
    email?: string
  }
  profile?: {
    full_name?: string
    phone?: string
    avatar_url?: string | null
  }
  roles?: string[]
  permissions?: {
    isAdmin?: boolean
    canManageUsers?: boolean
  }
  doctor?: Record<string, unknown> | null
  patient?: Record<string, unknown> | null
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

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json, application/problem+json",
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  }
}

function authHeadersWithBearer(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json, application/problem+json",
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${token}`,
  }
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
    clinicName: "Mediconnect",
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
      headers: authHeaders(),
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

export async function getUserInfoById(userIdInput: string): Promise<UserInfoByIdResponse> {
  const userId = userIdInput.trim()
  if (!userId) throw new Error("userId é obrigatório.")

  const body = { userId }
  try {
    return await apiRequest<UserInfoByIdResponse>("/user-info-by-id", {
      method: "POST",
      body,
      logErrors: false,
    })
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err
  }

  return apiRequest<UserInfoByIdResponse>("/functions/v1/user-info-by-id", {
    method: "POST",
    body,
    logErrors: false,
  })
}

export async function logoutSession(token: string): Promise<void> {
  if (!token || token.startsWith("local-dev:")) return

  const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/logout`, {
    method: "POST",
    headers: authHeadersWithBearer(token),
  })

  if (res.status === 401) {
    // Sessão já inválida no servidor; localmente ainda podemos encerrar normalmente.
    return
  }
  if (res.status !== 204 && !res.ok) {
    const raw = await res.text().catch(() => "")
    const parsed = safeJsonParse(raw)
    const message = parsed.error_description ?? parsed.message ?? parsed.error ?? "Não foi possível encerrar a sessão no servidor."
    throw new Error(message)
  }
}

export async function createPatientAccount(payload: PatientSignupPayload): Promise<PatientSignupResponse> {
  const name = payload.name.trim()
  const email = payload.email.trim().toLowerCase()
  const password = (payload.password ?? "").trim()
  const cpf = onlyDigits(payload.cpf)
  const phone = onlyDigits(payload.phone)

  if (!name || name.length < 3) throw new Error("Informe seu nome completo.")
  if (!email) throw new Error("Informe seu e-mail.")
  if (!isValidEmail(email)) throw new Error("E-mail inválido.")
  if (!password || password.length < 6) {
    throw new Error("A senha é obrigatória e deve ter pelo menos 6 caracteres.")
  }
  if (cpf.length !== 11) throw new Error("Informe um CPF válido com 11 dígitos.")
  if (!isValidCpf(cpf)) throw new Error("CPF inválido. Confira os números e os dígitos verificadores.")
  if (!phone) throw new Error("Informe seu telefone.")
  if (!/^\d{10,11}$/.test(phone)) throw new Error("Telefone inválido. Informe DDD + número (10-11 dígitos).")

  return createPatientAccountWithPassword({
    name, email, password, cpf, phone, dob: payload.dob,
  })
}

/** Credencial Auth pública para paciente já cadastrado na clínica (aba «Criar conta»). */
export async function createExistingPatientPortalAccess(input: {
  name: string
  email: string
  password: string
  cpf: string
  phone: string
  dob?: string
}): Promise<PatientSignupResponse> {
  const password = input.password.trim()
  if (password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.")

  return claimExistingPatientAccount({
    name:     input.name.trim(),
    email:    input.email.trim().toLowerCase(),
    password,
    cpf:      onlyDigits(input.cpf),
    phone:    onlyDigits(input.phone),
    dob:      input.dob,
  })
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
      return claimExistingPatientAccount(input)
    }

    throw new Error(translateApiError(err.message) || err.message)
  }
}

interface ParsedError {
  code?: string
  error_code?: string
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

function authErrorText(parsed: ParsedError & { error_code?: string }): string {
  return [
    parsed.error,
    parsed.message,
    parsed.detail,
    parsed.error_description,
    parsed.msg,
    parsed.title,
    parsed.error_code,
    parsed.code,
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" ")
}

function readableError(parsed: ParsedError): string | undefined {
  const raw =
    parsed.detail ??
    parsed.message ??
    parsed.error_description ??
    parsed.msg ??
    parsed.title ??
    parsed.error
  return raw ? translateApiError(raw) : undefined
}

function isExistingAuthUserError(parsed: ParsedError & { error_code?: string }): boolean {
  const text = authErrorText(parsed).toLowerCase()
  const code = (parsed.error_code ?? parsed.code ?? "").toLowerCase()
  return (
    code === "user_already_exists" ||
    /already.*registered|already.*exists|user.*exists|user_already_exists|email.*j[aá].*cadastrad|usu[aá]rio.*existe/i.test(text)
  )
}

/** Verifica se e-mail+senha já autenticam (sem montar sessão completa). */
export async function verifyPatientCredentials(email: string, password: string): Promise<boolean> {
  try {
    const res = await passwordGrantResponse(email, password)
    return res.ok
  } catch {
    return false
  }
}

async function passwordGrantResponse(email: string, password: string): Promise<Response> {
  return fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password: password.trim(),
    }),
  })
}

/** Motivo legível quando grant_type=password falha (para login e criação de acesso). */
export async function explainPasswordLoginFailure(
  email: string,
  password: string,
): Promise<string> {
  try {
    const res = await passwordGrantResponse(email, password)
    if (res.ok) return ""
    const err = await res.json().catch(() => ({})) as ParsedError & { error_code?: string }
    const message = err?.error_description ?? err?.message ?? err?.msg ?? ""
    const code = (err?.error ?? err?.code ?? err?.error_code ?? "").toString().toLowerCase()
    if (/email not confirmed|confirm/i.test(message) || code === "email_not_confirmed") {
      return "A conta existe, mas o e-mail ainda não foi confirmado. Verifique a caixa de entrada ou peça nova senha em «Esqueci minha senha»."
    }
    if (/invalid login|invalid.*credential|invalid.*password|invalid_grant/i.test(`${message} ${code}`)) {
      return "E-mail ou senha não conferem com o cadastro no servidor. Peça à secretária para salvar de novo o acesso ao portal no cadastro do paciente ou use «Esqueci minha senha»."
    }
    return translateApiError(message) || "Login recusado pelo servidor de autenticação."
  } catch {
    return "Não foi possível testar o login agora. Verifique sua conexão e tente de novo."
  }
}

interface ClaimPatientInput {
  name: string
  email: string
  password: string
  cpf: string
  phone: string
  dob?: string
}

/**
 * Ativa login para paciente já cadastrado na clínica (CPF existente).
 * Usa Supabase Auth público — create-user-with-password exige JWT de equipe (admin/gestor/secretaria).
 */
async function claimExistingPatientAccount(input: ClaimPatientInput): Promise<PatientSignupResponse> {
  const email = input.email.trim().toLowerCase()
  const password = input.password.trim()

  const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      email,
      password,
      data: {
        full_name: input.name.trim(),
        cpf:       input.cpf,
        phone:     input.phone || undefined,
        role:      "paciente",
      },
    }),
  })

  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    const problem = parseProblemDetails(raw)
    const parsed = safeJsonParse(raw)

    if (isExistingAuthUserError(parsed) || isExistingAuthUserError(problem as ParsedError)) {
      if (await verifyPatientCredentials(email, password)) {
        return {
          success: true,
          email,
          message: "Acesso confirmado. Entrando…",
          loginReady: true,
        }
      }
      throw new Error(
        "Este e-mail já está cadastrado. Use a aba «Entrar» com sua senha ou «Esqueci minha senha» para definir uma nova.",
      )
    }

    const message =
      readableError(parsed) ||
      translateApiError(messageFromProblemDetails(res.status, problem) ?? "") ||
      translateApiError(raw) ||
      "Não foi possível ativar seu acesso."
    throw new Error(message)
  }

  const data = await res.json().catch(() => null) as {
    user?: { id?: string; email?: string }
  } | null

  return {
    success: true,
    user_id: data?.user?.id,
    email:   data?.user?.email ?? email,
    message: "Acesso ativado. Entre com seu e-mail e senha.",
    loginReady: true,
  }
}

function defaultResetRedirectUrl(): string | undefined {
  if (typeof window === "undefined") return undefined
  return `${window.location.origin}/reset-password`
}

async function requestPasswordResetAt(
  path: string,
  email: string,
  redirectUrl?: string,
): Promise<Response> {
  const body: Record<string, string> = { email }
  if (redirectUrl?.trim()) body.redirect_url = redirectUrl.trim()
  return fetchWithTimeout(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, application/problem+json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
}

/**
 * Solicita o e-mail de recuperacao de senha no endpoint publico da API
 * (somente `apikey`, sem Bearer token), tentando:
 *  1) `/functions/v1/request-password-reset`
 *  2) `/request-password-reset`
 *
 * Mantemos fallback no `/auth/v1/recover` apenas para ambientes legados.
 */
export async function requestPasswordReset(emailInput: string): Promise<PasswordResetResponse> {
  const email = emailInput.trim().toLowerCase()
  if (!email) throw new Error("Informe seu e-mail.")
  const redirectUrl = defaultResetRedirectUrl()

  // Tentativa principal: endpoint publico da API (sem Authorization Bearer).
  let res: Response | null = null
  try {
    res = await requestPasswordResetAt("/functions/v1/request-password-reset", email, redirectUrl)
    if (res.status === 404) {
      res = await requestPasswordResetAt("/request-password-reset", email, redirectUrl)
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
      headers: authHeaders(),
      body: JSON.stringify({
        email,
        redirect_to: redirectUrl ?? window.location.origin,
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
    throw new Error(translateApiError(message) || message)
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

function flattenRoleInputs(roles: unknown[], profileRole?: string | null): string[] {
  const tokens: string[] = []
  const push = (value?: string | null) => {
    const n = normalizeRole(value)
    if (n) tokens.push(n)
  }

  for (const role of roles) {
    if (!role) continue
    if (typeof role === "string") push(role)
    else if (typeof role === "object" && role !== null && "role" in role) {
      push((role as { role?: string }).role)
    }
  }
  push(profileRole)
  return tokens
}

/** Sinônimos vindos de `profiles.role`, `user_roles.role` e `/user-info`. */
function expandRoleToken(token: string): ApiUserRole[] {
  const out: ApiUserRole[] = []
  const add = (role: ApiUserRole) => { if (!out.includes(role)) out.push(role) }

  if (["admin", "administrador", "administrator", "adm", "superadmin", "super_admin", "root"].includes(token)) {
    add("admin")
  }
  if (["gestor", "manager", "gerente", "coordenador", "coordenadora"].includes(token)) {
    add("gestor")
  }
  if (["medico", "medica", "doctor", "doutor", "doutora", "dr"].includes(token)) {
    add("medico")
  }
  if (["secretaria", "secretary", "secretario", "recepcao", "recepcionista", "atendimento"].includes(token)) {
    add("secretaria")
  }
  if (["paciente", "patient", "cliente"].includes(token)) {
    add("paciente")
  }
  // financeiro não existe em ApiUserRole; tratado em mapRoleFromTokens pelos tokens crus

  // Valores já canônicos da API
  if (["admin", "gestor", "medico", "secretaria", "paciente"].includes(token)) {
    add(token as ApiUserRole)
  }

  return out
}

function collectApiRoles(tokens: string[]): Set<ApiUserRole> {
  const set = new Set<ApiUserRole>()
  for (const token of tokens) {
    for (const role of expandRoleToken(token)) {
      set.add(role)
    }
  }
  return set
}

/** Escolhe o papel de maior privilégio quando o usuário tem vários em `user_roles`. */
function mapRoleFromTokens(tokens: string[], options?: { hasCrm?: boolean }): UserRole {
  const apiRoles = collectApiRoles(tokens)

  if (apiRoles.has("admin")) return "admin"
  if (apiRoles.has("gestor")) return "manager"
  if (apiRoles.has("medico")) return "doctor"
  if (tokens.some((t) => ["financeiro", "financial", "financas"].includes(t))) return "financial"
  if (apiRoles.has("secretaria")) return "secretary"
  if (apiRoles.has("paciente")) return "patient"

  if (options?.hasCrm) return "doctor"
  return "secretary"
}

const STAFF_ROLES = new Set<UserRole>(["admin", "manager", "doctor", "secretary", "financial"])

export interface ResolveLoginRoleInput {
  roles: unknown[]
  profileRole?: string | null
  userRoleRows?: string[]
  permissions?: { isAdmin?: boolean; canManageUsers?: boolean }
  linkedPatient?: PatientLinkResponse | null
  hasCrm?: boolean
}

/**
 * Decide o `UserRole` da sessão a partir dos papéis da API (`user_roles`,
 * `/user-info`, `profiles.role`). Exportado para testes; não faz I/O.
 */
export function resolveLoginRole(input: ResolveLoginRoleInput): UserRole {
  if (input.permissions?.isAdmin) return "admin"

  const userRoleRows = (input.userRoleRows ?? [])
    .map((r) => normalizeRole(r))
    .filter(Boolean)

  // `user_roles` é a fonte da verdade — não misturar com profiles.role desatualizado.
  const tokens =
    userRoleRows.length > 0
      ? userRoleRows
      : flattenRoleInputs(input.roles, input.profileRole)

  const apiRoles = collectApiRoles(tokens)
  const hasStaffInApi = ["admin", "gestor", "medico", "secretaria"].some((r) =>
    apiRoles.has(r as ApiUserRole),
  )

  // Paciente com registro em `patients` e sem papel de equipe → portal (evita default "secretary").
  if (input.linkedPatient && !hasStaffInApi) return "patient"

  // `/user-info`: gestor sem linha em user_roles mas com permissão de gerir usuários.
  if (userRoleRows.length === 0 && input.permissions?.canManageUsers) return "manager"

  const mapped = mapRoleFromTokens(tokens, { hasCrm: input.hasCrm })

  if (STAFF_ROLES.has(mapped)) return mapped
  if (mapped === "patient") return "patient"

  return mapped
}

async function fetchUserRoleNames(token: string, userId: string): Promise<string[]> {
  if (!userId) return []
  try {
    const res = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&select=role`,
      {
        headers: {
          "Content-Type":  "application/json",
          "apikey":        SUPABASE_ANON_KEY,
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
  if (!token || token.startsWith("local-dev:")) return user

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
    photoUrl:
      normalizeAvatarUrl(profile?.avatar_url, user.id) ??
      avatarUrlForUser(user.id) ??
      user.photoUrl,
  }
}

interface SupabaseAuthResponse {
  access_token: string; token_type: string
  expires_in: number; refresh_token: string
  user: { id: string; email: string }
}

interface AuthUserResponse {
  id?: string
  email?: string
  created_at?: string
}

interface UserInfoResponse {
  user?: {
    id?: string
    email?: string
  }
  profile?: {
    full_name?: string
    email?: string
    phone?: string
    avatar_url?: string | null
    role?: string
    crm?: string
    specialty?: string
    cpf?: string
    patient_id?: string
  }
  roles?: unknown[]
  permissions?: {
    isAdmin?: boolean
    canManageUsers?: boolean
  }
  doctor?: unknown | null
  patient?: unknown | null
}

interface ProfileResponse {
  id?: string
  full_name?: string
  email?: string
  phone?: string
  avatar_url?: string | null
  role?: string
  crm?: string
  specialty?: string
  cpf?: string
  patient_id?: string
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
    email ? `email.eq.${encodeURIComponent(email)}` : "",
    cpf ? `cpf.eq.${encodeURIComponent(onlyDigits(cpf))}` : "",
  ].filter(Boolean)
  if (filters.length === 0) return null

  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/patients?or=(${filters.join(",")})&select=id,cpf,email,phone_mobile&limit=1`, {
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
  const patient = await fetchPatientLink(token, user.id, user.email, user.patientCpf, user.patientId)
  if (!patient) {
    return {
      ...user,
      patientId: user.patientId ?? user.id,
    }
  }
  return {
    ...user,
    patientId: patient.id,
    patientCpf: patient.cpf ? onlyDigits(patient.cpf) : user.patientCpf,
    phone: patient.phone_mobile ?? user.phone,
    dob: user.dob,
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

async function withRoleLinks(user: User, token: string): Promise<User> {
  return withDoctorLink(await withPatientLink(user, token), token)
}

async function fetchUserInfo(token: string): Promise<UserInfoResponse | null> {
  async function post(path: string): Promise<Response> {
    return fetchWithTimeout(`${SUPABASE_URL}${path}`, {
      method: "POST",
      headers: authHeadersWithBearer(token),
    })
  }

  try {
    // Edge Function primeiro — `/user-info` na raiz costuma falhar CORS no browser.
    let res = await post("/functions/v1/user-info")
    if (res.status === 404) res = await post("/user-info")
    if (!res.ok) return null
    return await res.json().catch(() => null) as UserInfoResponse | null
  } catch {
    return null
  }
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
        headers: authHeaders(),
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
    throw new Error(translateApiError(message) || "E-mail ou senha inválidos.")
  }

  const authData: SupabaseAuthResponse = await authRes.json()

  // Passo 2 — obter usuario no endpoint documentado `/functions/v1/user-info`.
  // Se indisponivel, mantemos fallback para `/auth/v1/user` + profiles.
  const info = await fetchUserInfo(authData.access_token)
  const infoUserId = info?.user?.id
  const infoEmail = info?.user?.email
  const resolvedUserId = (infoUserId ?? authData.user.id).trim()
  const resolvedEmail = (infoEmail ?? authData.user.email).trim().toLowerCase()

  let profile = info?.profile ?? null
  if (!profile) {
    const authUserRes = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: authHeadersWithBearer(authData.access_token),
    })
    let authUser: AuthUserResponse = {}
    if (authUserRes.ok) {
      authUser = await authUserRes.json().catch(() => ({})) as AuthUserResponse
    }
    const fallbackUserId = (authUser.id ?? resolvedUserId).trim()
    const fallbackEmail = (authUser.email ?? resolvedEmail).trim().toLowerCase()
    profile = await fetchProfileFallback(authData.access_token, fallbackUserId, fallbackEmail)
  }
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
    patientCpf: isPatientLogin
      ? (patient?.cpf ? onlyDigits(patient.cpf) : profile?.cpf ? onlyDigits(profile.cpf) : undefined)
      : undefined,
    patientId: isPatientLogin ? (patient?.id ?? profile?.patient_id) : undefined,
    phone: (isPatientLogin ? patient?.phone_mobile : undefined) ?? profile?.phone,
    dob: isPatientLogin ? patient?.birth_date : undefined,
    photoUrl:
      normalizeAvatarUrl(profile?.avatar_url, resolvedUserId) ??
      avatarUrlForUser(resolvedUserId),
  }

  return {
    user: await withRoleLinks(user, authData.access_token),
    token: authData.access_token,
    clinicId: "default",
    clinicName: "Mediconnect",
    refreshToken: authData.refresh_token ?? null,
    expiresAt: expiresAtFromSeconds(authData.expires_in),
  }
}

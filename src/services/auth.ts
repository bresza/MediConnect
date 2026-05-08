import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./api"
import type { User, UserRole } from "../types"

export interface LoginPayload  { email: string; password: string }
export interface PatientSignupPayload {
  name: string
  email: string
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
}
export interface LoginResponse {
  user: User; token: string; clinicId: string; clinicName: string
}
export interface PasswordResetResponse {
  success: boolean
  message: string
}
export interface DemoAccount {
  id: string; name: string; role: UserRole; email: string; password: string
}
export function getDemoAccounts(): DemoAccount[] { return [] }

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "")
}

function parseAuthMessage(raw: string): string {
  if (!raw) return ""
  try {
    const parsed = JSON.parse(raw)
    return parsed?.detail ?? parsed?.message ?? parsed?.error_description ?? parsed?.msg ?? parsed?.title ?? parsed?.error ?? raw
  } catch {
    return raw
  }
}

async function publicApiPost(path: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })
}

async function sendMagicLink(email: string): Promise<PatientSignupResponse> {
  const res = await publicApiPost("/auth/v1/otp", { email })
  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    throw new Error(parseAuthMessage(raw) || "Não foi possível enviar o link de acesso.")
  }
  return {
    success: true,
    email,
    message: "Cadastro já existente. Enviamos um link de acesso para o e-mail informado.",
  }
}

export async function createPatientAccount(payload: PatientSignupPayload): Promise<PatientSignupResponse> {
  const name = payload.name.trim()
  const email = payload.email.trim().toLowerCase()
  const cpf = onlyDigits(payload.cpf)
  const phone = onlyDigits(payload.phone)

  if (!name) throw new Error("Informe seu nome completo.")
  if (!email) throw new Error("Informe seu e-mail.")
  if (cpf.length !== 11) throw new Error("Informe um CPF válido com 11 dígitos.")
  if (!phone) throw new Error("Informe seu telefone.")

  const body = {
    email,
    full_name: name,
    phone_mobile: phone,
    cpf,
    birth_date: payload.dob || undefined,
    redirect_url: window.location.origin,
  }

  let res = await publicApiPost("/functions/v1/register-patient", body)
  if (res.status === 404) res = await publicApiPost("/register-patient", body)

  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    const message = parseAuthMessage(raw) || "Erro ao criar conta de paciente."
    if (res.status === 409 || /existe|cadastrado|registered|exists/i.test(message)) {
      return sendMagicLink(email)
    }
    throw new Error(message)
  }

  const data = await res.json().catch(() => null) as Partial<PatientSignupResponse> | null
  return {
    success: data?.success ?? true,
    patient_id: data?.patient_id,
    user_id: data?.user_id,
    email: data?.email ?? email,
    message: data?.message ?? "Cadastro realizado com sucesso. Verifique seu e-mail para acessar a plataforma.",
  }
}

export async function requestPasswordReset(emailInput: string): Promise<PasswordResetResponse> {
  const email = emailInput.trim().toLowerCase()
  if (!email) throw new Error("Informe seu e-mail.")

  const body = { email, redirect_url: window.location.origin }
  let res = await publicApiPost("/functions/v1/request-password-reset", body)
  if (res.status === 404) res = await publicApiPost("/request-password-reset", body)

  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    throw new Error(parseAuthMessage(raw) || "Não foi possível enviar o e-mail de recuperação.")
  }

  const data = await res.json().catch(() => null) as Partial<PasswordResetResponse> | null
  return {
    success: data?.success ?? true,
    message: data?.message ?? "E-mail de recuperação enviado. Verifique sua caixa de entrada.",
  }
}

function normalizeRole(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

// Mapeamento tolerante de roles da API → frontend
function mapRole(roles: unknown[]): UserRole {
  const normalized = roles
    .flatMap((role) => {
      if (!role) return []
      if (typeof role === "string") return [normalizeRole(role)]
      if (typeof role === "object" && "role" in role) {
        return [normalizeRole((role as { role?: string }).role)]
      }
      return []
    })

  if (normalized.some((r) => ["admin", "gestor", "manager"].includes(r))) return "manager"
  if (normalized.some((r) => ["medico", "doctor"].includes(r))) return "doctor"
  if (normalized.some((r) => ["paciente", "patient"].includes(r))) return "patient"
  if (normalized.some((r) => ["secretaria", "secretary"].includes(r))) return "secretary"
  if (normalized.some((r) => ["financeiro", "financial"].includes(r))) return "financial"
  return "secretary"
}

interface SupabaseAuthResponse {
  access_token: string; token_type: string
  expires_in: number; refresh_token: string
  user: { id: string; email: string }
}

interface UserInfoResponse {
  user:    { id: string; email: string }
  profile?: { id?: string; full_name?: string; email?: string; phone?: string; crm?: string; specialty?: string; cpf?: string; patient_id?: string }
  patient?: PatientLinkResponse
  roles?:   unknown[]
}

interface ProfileResponse {
  id?: string
  full_name?: string
  email?: string
  phone?: string
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

interface UserRoleResponse {
  role?: string
}

async function fetchProfileFallback(token: string, userId: string, email: string): Promise<ProfileResponse | null> {
  const query = `or=(id.eq.${encodeURIComponent(userId)},email.eq.${encodeURIComponent(email)})&select=*`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${query}`, {
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

async function fetchRolesFallback(token: string, userId: string): Promise<unknown[]> {
  const query = `user_id=eq.${encodeURIComponent(userId)}&select=role`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?${query}`, {
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
  })
  if (!res.ok) return []
  const data = await res.json().catch(() => [])
  return Array.isArray(data) ? data.map((item: UserRoleResponse) => item.role).filter(Boolean) : []
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

  const res = await fetch(`${SUPABASE_URL}/rest/v1/patients?or=(${filters.join(",")})&select=id,user_id,cpf,email,phone_mobile,birth_date&limit=1`, {
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
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
  if (!patient) return { ...user, patientId: user.patientId ?? user.id }
  return {
    ...user,
    patientId: patient.id,
    patientCpf: patient.cpf ? onlyDigits(patient.cpf) : user.patientCpf,
    phone: patient.phone_mobile ?? user.phone,
    dob: patient.birth_date ?? user.dob,
  }
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  // Passo 1 — autenticar
  const authRes = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: payload.email, password: payload.password }),
    },
  )

  if (!authRes.ok) {
    const err = await authRes.json().catch(() => ({}))
    throw new Error(err?.error_description ?? err?.message ?? "E-mail ou senha inválidos")
  }

  const authData: SupabaseAuthResponse = await authRes.json()

  // Passo 2 — buscar perfil e roles
  const infoRes = await fetch(`${SUPABASE_URL}/functions/v1/user-info`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${authData.access_token}`,
    },
  })

  if (!infoRes.ok) {
    const [profile, roles] = await Promise.all([
      fetchProfileFallback(authData.access_token, authData.user.id, authData.user.email),
      fetchRolesFallback(authData.access_token, authData.user.id),
    ])
    const user: User = {
      id: authData.user.id,
      name: profile?.full_name ?? authData.user.email,
      role: mapRole(roles),
      email: profile?.email ?? authData.user.email,
      crm: profile?.crm,
      specialty: profile?.specialty,
      patientCpf: profile?.cpf ? onlyDigits(profile.cpf) : undefined,
      phone: profile?.phone,
      patientId: profile?.patient_id,
    }
    return { user: await withPatientLink(user, authData.access_token), token: authData.access_token, clinicId: "default", clinicName: "Mediconnect" }
  }

  const info: UserInfoResponse = await infoRes.json()
  const user: User = {
    id:        authData.user.id,
    name:      info.profile?.full_name ?? authData.user.email,
    role:      mapRole(info.roles ?? []),
    email:     info.profile?.email     ?? authData.user.email,
    crm:       info.profile?.crm,
    specialty: info.profile?.specialty,
    patientCpf: info.patient?.cpf ? onlyDigits(info.patient.cpf) : info.profile?.cpf ? onlyDigits(info.profile.cpf) : undefined,
    patientId: info.patient?.id ?? info.profile?.patient_id,
    phone: info.patient?.phone_mobile ?? info.profile?.phone,
    dob: info.patient?.birth_date,
  }

  return { user: await withPatientLink(user, authData.access_token), token: authData.access_token, clinicId: "default", clinicName: "Mediconnect" }
}

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./api"
import type { User, UserRole } from "../types"

export interface LoginPayload  { email: string; password: string }
export interface PatientSignupPayload {
  name: string; email: string; cpf: string; phone: string; dob?: string
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
    clinicName: "Mediconnect",
  }
}

async function sendMagicLink(email: string): Promise<PatientSignupResponse> {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email }),
  })

  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    let message = raw || "Não foi possível enviar o link de acesso."
    try {
      const parsed = JSON.parse(raw)
      message = parsed?.detail ?? parsed?.message ?? parsed?.error_description ?? parsed?.msg ?? parsed?.title ?? message
    } catch { /* not json */ }
    throw new Error(message)
  }

  return {
    success: true,
    email,
    message: "CPF já cadastrado no sistema. Enviamos um link de acesso para o e-mail informado.",
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

  const requestBody = {
    email,
    full_name: name,
    phone_mobile: phone,
    cpf,
    birth_date: payload.dob || undefined,
    redirect_url: window.location.origin,
  }

  async function postRegister(path: string) {
    return fetchWithTimeout(`${SUPABASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(requestBody),
    })
  }

  let res = await postRegister("/functions/v1/register-patient")
  if (res.status === 404) res = await postRegister("/register-patient")

  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    let message = raw || "Erro ao criar conta de paciente."
    try {
      const parsed = JSON.parse(raw)
      message = parsed?.detail ?? parsed?.message ?? parsed?.error_description ?? parsed?.msg ?? parsed?.title ?? message
      if (
        parsed?.code === "CPF_EXISTS" ||
        res.status === 409 ||
        /cpf|e-?mail|paciente|usu[aá]rio/i.test(message) && /existe|cadastrado|registered|exists/i.test(message)
      ) {
        return sendMagicLink(email)
      }
    } catch { /* not json */ }
    if (res.status === 409 || /existe|cadastrado|registered|exists/i.test(message)) return sendMagicLink(email)
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
    }),
  })
}

export async function requestPasswordReset(emailInput: string): Promise<PasswordResetResponse> {
  const email = emailInput.trim().toLowerCase()
  if (!email) throw new Error("Informe seu e-mail.")

  let res = await requestPasswordResetAt("/functions/v1/request-password-reset", email)
  if (res.status === 404) res = await requestPasswordResetAt("/request-password-reset", email)

  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    let message = raw || "Não foi possível enviar o e-mail de recuperação."
    try {
      const parsed = JSON.parse(raw)
      message = parsed?.detail ?? parsed?.message ?? parsed?.error_description ?? parsed?.msg ?? parsed?.title ?? message
    } catch { /* not json */ }
    throw new Error(message)
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
function mapRole(roles: unknown[], profileRole?: string | null): UserRole {
  const normalized = [...roles, profileRole]
    .flatMap((role) => {
      if (!role) return []
      if (typeof role === "string") return [normalizeRole(role)]
      if (typeof role === "object" && "role" in role) {
        return [normalizeRole((role as { role?: string }).role)]
      }
      return []
    })

  if (normalized.some((r) => ["admin", "administrador"].includes(r))) return "admin"
  if (normalized.some((r) => ["gestor", "manager"].includes(r))) return "manager"
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
  profile?: { id?: string; full_name?: string; email?: string; phone?: string; role?: string; crm?: string; specialty?: string; cpf?: string; patient_id?: string }
  patient?: PatientLinkResponse
  roles?:   unknown[]
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

  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/doctors?or=(${filters.join(",")})&select=id,email,full_name,crm,crm_uf,crm_state&limit=1`, {
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

async function withRoleLinks(user: User, token: string): Promise<User> {
  return withDoctorLink(await withPatientLink(user, token), token)
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  // Passo 1 — autenticar
  let authRes: Response
  try {
    authRes = await fetchWithTimeout(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: payload.email, password: payload.password }),
      },
    )
  } catch (err) {
    const local = localDevLogin(payload)
    if (local) return local
    throw err
  }

  if (!authRes.ok) {
    const err = await authRes.json().catch(() => ({}))
    const message = err?.error_description ?? err?.message ?? ""
    if (/email not confirmed|confirm/i.test(message)) {
      throw new Error("Confirme o e-mail antes de fazer login.")
    }
    throw new Error(message || "E-mail ou senha inválidos")
  }

  const authData: SupabaseAuthResponse = await authRes.json()

  // Passo 2 — buscar perfil e roles
  const infoRes = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/user-info`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${authData.access_token}`,
    },
  })

  if (!infoRes.ok) {
    const profile = await fetchProfileFallback(authData.access_token, authData.user.id, authData.user.email)
    const user: User = {
      id: authData.user.id,
      name: profile?.full_name ?? authData.user.email,
      role: mapRole([], profile?.role),
      email: profile?.email ?? authData.user.email,
      crm: profile?.crm,
      specialty: profile?.specialty,
      patientCpf: profile?.cpf ? onlyDigits(profile.cpf) : undefined,
      phone: profile?.phone,
      patientId: profile?.patient_id,
    }
    return { user: await withRoleLinks(user, authData.access_token), token: authData.access_token, clinicId: "default", clinicName: "Mediconnect" }
  }

  const info: UserInfoResponse = await infoRes.json()
  const user: User = {
    id:        authData.user.id,
    name:      info.profile?.full_name ?? authData.user.email,
    role:      mapRole(info.roles ?? [], info.profile?.role),
    email:     info.profile?.email ?? info.patient?.email ?? authData.user.email,
    crm:       info.profile?.crm,
    specialty: info.profile?.specialty,
    patientCpf: info.patient?.cpf ? onlyDigits(info.patient.cpf) : info.profile?.cpf ? onlyDigits(info.profile.cpf) : undefined,
    patientId:  info.patient?.id ?? info.profile?.patient_id,
    phone:     info.patient?.phone_mobile ?? info.profile?.phone,
    dob:       info.patient?.birth_date,
  }

  return { user: await withRoleLinks(user, authData.access_token), token: authData.access_token, clinicId: "default", clinicName: "Mediconnect" }
}

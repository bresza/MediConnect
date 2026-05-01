import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./api"
import type { User, UserRole } from "../types"

export interface LoginPayload  { email: string; password: string }
export interface LoginResponse {
  user: User; token: string; clinicId: string; clinicName: string
}
export interface DemoAccount {
  id: string; name: string; role: UserRole; email: string; password: string
}
export function getDemoAccounts(): DemoAccount[] { return [] }

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
  profile?: { id?: string; full_name?: string; email?: string; phone?: string; crm?: string; specialty?: string }
  roles?:   unknown[]
}

interface ProfileResponse {
  id?: string
  full_name?: string
  email?: string
  phone?: string
  crm?: string
  specialty?: string
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
    }
    return { user, token: authData.access_token, clinicId: "default", clinicName: "Mediconnect" }
  }

  const info: UserInfoResponse = await infoRes.json()
  const user: User = {
    id:        authData.user.id,
    name:      info.profile?.full_name ?? authData.user.email,
    role:      mapRole(info.roles ?? []),
    email:     info.profile?.email     ?? authData.user.email,
    crm:       info.profile?.crm,
    specialty: info.profile?.specialty,
  }

  return { user, token: authData.access_token, clinicId: "default", clinicName: "Mediconnect" }
}

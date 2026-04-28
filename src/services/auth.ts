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

// Mapeamento de roles da API → frontend
function mapRole(roles: string[]): UserRole {
  if (roles.includes("admin"))      return "manager"
  if (roles.includes("gestor"))     return "manager"
  if (roles.includes("medico"))     return "doctor"
  if (roles.includes("secretaria")) return "secretary"
  if (roles.includes("financeiro")) return "financial"
  return "secretary"
}

interface SupabaseAuthResponse {
  access_token: string; token_type: string
  expires_in: number; refresh_token: string
  user: { id: string; email: string }
}

interface UserInfoResponse {
  user:    { id: string; email: string }
  profile: { id: string; full_name: string; email: string; phone?: string; crm?: string; specialty?: string }
  roles:   string[]
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
    // fallback mínimo
    return {
      user: { id: authData.user.id, name: authData.user.email, role: "secretary", email: authData.user.email },
      token: authData.access_token, clinicId: "default", clinicName: "Mediconnect",
    }
  }

  const info: UserInfoResponse = await infoRes.json()
  const user: User = {
    id:        info.profile?.id        ?? authData.user.id,
    name:      info.profile?.full_name ?? authData.user.email,
    role:      mapRole(info.roles ?? []),
    email:     info.profile?.email     ?? authData.user.email,
    crm:       info.profile?.crm,
    specialty: info.profile?.specialty,
  }

  return { user, token: authData.access_token, clinicId: "default", clinicName: "Mediconnect" }
}

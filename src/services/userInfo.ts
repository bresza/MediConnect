import { SUPABASE_ANON_KEY, SUPABASE_URL, getApiToken } from "./api"
import type { Patient } from "../types"

/** Resposta de POST /user-info (Apidog — Usuários). */
export interface UserInfoPatient {
  id: string
  user_id?: string
  cpf?: string
  email?: string
  phone_mobile?: string
  birth_date?: string
}

export interface UserInfoResponse {
  user: { id: string; email: string }
  profile?: {
    full_name?: string
    phone?: string
    patient_id?: string
    cpf?: string
    email?: string
    crm?: string
    specialty?: string
    gender?: string
    sex?: string
    role?: string
    avatar_url?: string
  }
  patient?: UserInfoPatient | null
  roles?: unknown[]
  permissions?: { isAdmin?: boolean; canManageUsers?: boolean }
}

const USER_INFO_PATHS = ["/functions/v1/user-info", "/user-info"] as const

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Contrato Apidog: POST /user-info */
export async function fetchUserInfo(token?: string | null): Promise<UserInfoResponse | null> {
  const authToken = token ?? getApiToken()
  if (!authToken || !SUPABASE_URL) return null

  for (const path of USER_INFO_PATHS) {
    const res = await fetchWithTimeout(`${SUPABASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${authToken}`,
      },
    }).catch(() => null)
    if (!res?.ok) continue
    const data = await res.json().catch(() => null) as UserInfoResponse | null
    if (data?.user?.id) return data
  }
  return null
}

/** patient_id oficial do usuário logado (portal do paciente). */
export async function resolvePatientIdFromApi(token?: string | null): Promise<string | null> {
  const info = await fetchUserInfo(token)
  return info?.patient?.id ?? info?.profile?.patient_id ?? null
}

function isUuid(value?: string | null): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  )
}

/** Monta um Patient mínimo a partir de POST /user-info quando o REST de patients está bloqueado por RLS. */
export function patientFromUserInfo(
  info: UserInfoResponse,
  patientId: string,
  identity?: { userId?: string; name?: string; email?: string; cpf?: string },
): Patient {
  const profile = info.profile
  const apiPatient = info.patient
  return {
    id: patientId,
    userId: apiPatient?.user_id ?? identity?.userId,
    name: profile?.full_name ?? identity?.name ?? "",
    cpf: apiPatient?.cpf ?? profile?.cpf ?? identity?.cpf ?? "",
    email: apiPatient?.email ?? profile?.email ?? info.user.email ?? identity?.email ?? "",
    phone: apiPatient?.phone_mobile ?? profile?.phone ?? "",
    dob: apiPatient?.birth_date ?? "",
    status: "Active",
  }
}

export { isUuid }

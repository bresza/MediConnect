import { apiRequest } from "./api"
import type { User } from "../types"

export interface ProfileSettings {
  id: string
  fullName: string
  email: string
  phone: string
  role: string
  avatarUrl?: string
}

interface ApiProfile {
  id: string
  full_name?: string
  email?: string
  phone?: string
  role?: string
  avatar_url?: string
  photo_url?: string
}

function apiToSettings(api: ApiProfile, fallback: User): ProfileSettings {
  return {
    id: api.id,
    fullName: api.full_name ?? fallback.name,
    email: api.email ?? fallback.email,
    phone: api.phone ?? "",
    role: api.role ?? fallback.role,
    avatarUrl: api.avatar_url ?? api.photo_url,
  }
}

export async function getProfileSettings(user: User): Promise<ProfileSettings> {
  const query = `or=(id.eq.${encodeURIComponent(user.id)},email.eq.${encodeURIComponent(user.email)})&select=*`
  const profiles = await apiRequest<ApiProfile[]>(`/rest/v1/profiles?${query}`)
  const profile = profiles[0] ?? {
    id: user.id,
    full_name: user.name,
    email: user.email,
    role: user.role,
  }
  return apiToSettings(profile, user)
}

export async function updateProfileSettings(settings: ProfileSettings): Promise<ProfileSettings> {
  await apiRequest(`/rest/v1/profiles?id=eq.${settings.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: {
      full_name: settings.fullName.trim(),
      email: settings.email.trim(),
      phone: settings.phone.trim() || null,
      avatar_url: settings.avatarUrl || null,
    },
  })
  return settings
}

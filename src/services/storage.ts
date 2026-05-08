import { getApiToken, SUPABASE_ANON_KEY, SUPABASE_URL } from "./api"

function extensionFromFile(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName
  const fromType = file.type.split("/").pop()?.toLowerCase()
  return fromType || "jpg"
}

export function avatarUrl(path: string): string {
  const normalized = path.replace(/^\/+/, "")
  if (/^https?:\/\//i.test(path)) return path
  return `${SUPABASE_URL}/storage/v1/object/avatars/${encodeURI(normalized)}`
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!userId) throw new Error("Usuário inválido para upload de avatar.")
  if (!file.type.startsWith("image/")) throw new Error("Envie uma imagem válida.")

  const path = `${userId}/avatar-${Date.now()}.${extensionFromFile(file)}`
  const token = getApiToken()
  const baseHeaders: Record<string, string> = {
    "apikey": SUPABASE_ANON_KEY,
  }
  if (token) baseHeaders["Authorization"] = `Bearer ${token}`

  async function sendRaw() {
    return fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${encodeURI(path)}`, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    })
  }

  async function sendMultipart() {
    const form = new FormData()
    form.append("file", file)
    return fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${encodeURI(path)}`, {
      method: "POST",
      headers: baseHeaders,
      body: form,
    })
  }

  let res = await sendRaw()
  if (res.status === 400 || res.status === 415) {
    res = await sendMultipart()
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    let message = raw || "Não foi possível enviar o avatar."
    try {
      const parsed = JSON.parse(raw)
      message = parsed?.detail ?? parsed?.message ?? parsed?.error_description ?? parsed?.msg ?? parsed?.title ?? message
    } catch { /* not json */ }
    throw new Error(message)
  }

  return avatarUrl(path)
}

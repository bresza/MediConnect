import type { Message } from "../types"

const AUTH_STORAGE_KEY = "mediconnect:auth"
const HISTORY_VERSION = "v1"
const MAX_ITEMS = 150

function readAuthScope(): { clinicId: string; userId: string } | null {
  try {
    if (typeof localStorage === "undefined") return null
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      clinicId?: string | null
      user?: { id?: string } | null
    }
    const userId = parsed.user?.id?.trim()
    if (!userId) return null
    return {
      clinicId: parsed.clinicId?.trim() || "clinic",
      userId,
    }
  } catch {
    return null
  }
}

function storageKey(clinicId: string, userId: string): string {
  return `mediconnect:message-history:${HISTORY_VERSION}:${clinicId}:${userId}`
}

export function loadMessageHistory(): Message[] {
  const scope = readAuthScope()
  if (!scope) return []
  try {
    const raw = localStorage.getItem(storageKey(scope.clinicId, scope.userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as Message[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function appendMessageHistory(message: Message): void {
  const scope = readAuthScope()
  if (!scope) return
  try {
    const current = loadMessageHistory()
    const next = [message, ...current.filter((m) => m.id !== message.id)].slice(0, MAX_ITEMS)
    localStorage.setItem(storageKey(scope.clinicId, scope.userId), JSON.stringify(next))
  } catch {
    /* quota / modo privado */
  }
}

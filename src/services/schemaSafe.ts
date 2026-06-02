import { ApiError } from "./api"

/** Erro PostgREST quando `select` pede coluna que não existe no banco. */
export function isMissingColumnError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if (err.status !== 400 && err.status !== 406) return false
  const msg = err.message
  return (
    /column\s+[\w.]+\s+does not exist/i.test(msg) ||
    /could not find the '[^']+' column/i.test(msg) ||
    /não reconhece um dos campos enviados/i.test(msg)
  )
}

/** Edge Functions opcionais (lembretes/WhatsApp cron) — só chamar se deployadas. */
export function isEdgeAutomationEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_EDGE_AUTOMATION === "true"
}

/** Endpoints opcionais indisponíveis (404/CORS) — evita spam no console. */
const unavailableEndpoints = new Set<string>()

function persistKey(key: string): string {
  return `mediconnect:endpoint-unavailable:${key}`
}

function readPersistedUnavailable(key: string): boolean {
  try {
    return localStorage.getItem(persistKey(key)) === "1"
  } catch {
    return false
  }
}

export function isEndpointUnavailable(key: string): boolean {
  if (unavailableEndpoints.has(key)) return true
  if (readPersistedUnavailable(key)) {
    unavailableEndpoints.add(key)
    return true
  }
  return false
}

export function markEndpointUnavailable(key: string): void {
  unavailableEndpoints.add(key)
  try {
    localStorage.setItem(persistKey(key), "1")
  } catch {
    // localStorage indisponível
  }
}

/** Marca indisponível em 404, 403 ou falha de rede/CORS (status 0). */
export function markEndpointUnavailableFromError(key: string, err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if ([0, 403, 404].includes(err.status)) {
    markEndpointUnavailable(key)
    return true
  }
  return false
}

/** Tabelas REST de fila inbound (whatsapp_messages) — não documentadas; opt-in via automação. */
export function isInboundRestEnabled(): boolean {
  return isEdgeAutomationEnabled() && !isEndpointUnavailable("rest:inbound-messages")
}

/** Fila de espera remota (appointment_waitlist) — opt-in; fallback local quando ausente. */
export function isWaitlistRestEnabled(): boolean {
  return !isEndpointUnavailable("rest:appointment_waitlist")
}

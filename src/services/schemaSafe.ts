import { ApiError } from "./api"

/** Erro PostgREST quando `select` pede coluna que não existe no banco. */
export function isMissingColumnError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  if (err.status !== 400 && err.status !== 406) return false
  return /column\s+[\w.]+\s+does not exist/i.test(err.message)
}

/** Edge Functions opcionais (lembretes/WhatsApp cron) — só chamar se deployadas. */
export function isEdgeAutomationEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_EDGE_AUTOMATION === "true"
}

export const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const REQUEST_TIMEOUT_MS = 15000

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown
  logErrors?: boolean
}

let _token:          string | null = null
let _userId:         string | null = null
let _onUnauthorized: (() => void) | null = null

function isLocalToken(token: string | null): boolean {
  return token?.startsWith("local-") ?? false
}

export function setApiContext(
  token:  string | null,
  _:      string | null,
  userId: string | null = null,
) {
  _token  = token
  _userId = userId
}

export function getApiUserId(): string | null { return _userId }

export function getApiToken(): string | null { return _token }

export function setUnauthorizedHandler(handler: () => void) {
  _onUnauthorized = handler
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message); this.name = "ApiError"; this.status = status
  }
}

function connectionError(): ApiError {
  return new ApiError(
    0,
    "Não foi possível conectar ao Supabase configurado. Verifique a URL do projeto, a conexão de rede ou se o projeto está ativo.",
  )
}

function friendlyMessage(status: number, raw: string): string {
  switch (status) {
    case 400: return raw || "Dados inválidos. Verifique os campos e tente novamente."
    case 401: return raw || "Sessão expirada. Faça login novamente."
    case 403: return raw || "Você não tem permissão para realizar esta ação."
    case 404: return raw || "Recurso não encontrado."
    case 409: return raw || "Conflito: registro já existe ou está em uso."
    case 422: return raw || "Erro de validação nos dados enviados."
    case 429: return raw || "Muitas requisições. Aguarde alguns instantes."
    case 500: return raw || "Erro interno do servidor. Tente novamente em instantes."
    case 502: case 503: case 504: return raw || "Serviço temporariamente indisponível."
    default:  return raw || `Erro inesperado (${status}).`
  }
}

function parseErrorMessage(raw: string): string {
  if (!raw) return ""
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === "string") return parseErrorMessage(parsed)
    return (
      parsed?.detail ??
      parsed?.message ??
      parsed?.error_description ??
      parsed?.msg ??
      parsed?.title ??
      parsed?.error ??
      raw
    )
  } catch {
    return raw
  }
}

export async function apiRequest<T>(
  path:    string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, logErrors = true, ...rest } = options
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey":       SUPABASE_ANON_KEY,
    ...(rest.headers as Record<string, string> ?? {}),
  }
  if (_token && !isLocalToken(_token)) headers["Authorization"] = `Bearer ${_token}`

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      ...rest,
      headers,
      signal: rest.signal ?? controller.signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw connectionError()
  } finally {
    window.clearTimeout(timeoutId)
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => res.statusText)
    if (res.status === 401 && _onUnauthorized && !isLocalToken(_token)) _onUnauthorized()
    const errorMsg = parseErrorMessage(raw) || res.statusText
    if (logErrors) {
      console.error("[apiRequest]", {
        status: res.status,
        path,
        raw,
        message: errorMsg,
      })
    }
    throw new ApiError(res.status, friendlyMessage(res.status, errorMsg))
  }
  if (res.status === 204) return undefined as T

  const raw = await res.text().catch(() => "")
  if (!raw) return undefined as T
  try {
    return JSON.parse(raw) as T
  } catch {
    return raw as T
  }
}

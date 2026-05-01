export const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown
}

let _token:          string | null = null
let _userId:         string | null = null
let _onUnauthorized: (() => void) | null = null

export function setApiContext(
  token:  string | null,
  _:      string | null,
  userId: string | null = null,
) {
  _token  = token
  _userId = userId
}

export function getApiUserId(): string | null { return _userId }

export function setUnauthorizedHandler(handler: () => void) {
  _onUnauthorized = handler
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message); this.name = "ApiError"; this.status = status
  }
}

function friendlyMessage(status: number, raw: string): string {
  switch (status) {
    case 400: return raw || "Dados inválidos. Verifique os campos e tente novamente."
    case 401: return "Sessão expirada. Faça login novamente."
    case 403: return "Você não tem permissão para realizar esta ação."
    case 404: return "Recurso não encontrado."
    case 409: return "Conflito: registro já existe ou está em uso."
    case 422: return raw || "Erro de validação nos dados enviados."
    case 429: return "Muitas requisições. Aguarde alguns instantes."
    case 500: return "Erro interno do servidor. Tente novamente em instantes."
    case 502: case 503: case 504: return "Serviço temporariamente indisponível."
    default:  return raw || `Erro inesperado (${status}).`
  }
}

export async function apiRequest<T>(
  path:    string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, ...rest } = options
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey":       SUPABASE_ANON_KEY,
    ...(rest.headers as Record<string, string> ?? {}),
  }
  if (_token) headers["Authorization"] = `Bearer ${_token}`

  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...rest, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const raw = await res.text().catch(() => res.statusText)
    if (res.status === 401 && _onUnauthorized) _onUnauthorized()
    let errorMsg = raw
    try {
      const parsed = JSON.parse(raw)
      errorMsg = parsed?.message ?? parsed?.error_description ?? parsed?.msg ?? raw
    } catch { /* not json */ }
    console.error("[apiRequest]", {
      status: res.status,
      path,
      raw,
      message: errorMsg,
    })
    throw new ApiError(res.status, friendlyMessage(res.status, errorMsg))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

import { messageFromProblemDetails, parseProblemDetails, sanitizeDatabaseMessage } from "./problemDetails"

// Le e normaliza as credenciais do Supabase. Sem esse passo, qualquer build
// que tenha sido gerado sem VITE_SUPABASE_URL acaba chamando `undefined/auth/...`,
// o que vira um 404 no proprio dominio do Vercel e quebra o login silenciosamente.
const RAW_SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const RAW_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function sanitizeSupabaseUrl(value: unknown): string {
  if (typeof value !== "string") return ""
  return value.trim().replace(/\/+$/, "")
}

export const SUPABASE_URL      = sanitizeSupabaseUrl(RAW_SUPABASE_URL)
export const SUPABASE_ANON_KEY = typeof RAW_SUPABASE_ANON_KEY === "string" ? RAW_SUPABASE_ANON_KEY.trim() : ""

export const SUPABASE_CONFIG_ERROR: string | null = (() => {
  const missing: string[] = []
  if (!SUPABASE_URL)      missing.push("VITE_SUPABASE_URL")
  if (!SUPABASE_ANON_KEY) missing.push("VITE_SUPABASE_ANON_KEY")
  if (missing.length === 0) return null
  return (
    `Configuracao do Supabase ausente no build: defina ${missing.join(" e ")} ` +
    "no painel do Vercel (Settings -> Environment Variables, escopo Production) " +
    "e disparare um novo Deploy. Variaveis do Vite sao lidas em tempo de build."
  )
})()

if (SUPABASE_CONFIG_ERROR && typeof console !== "undefined") {
  console.error(`[mediconnect] ${SUPABASE_CONFIG_ERROR}`)
}

const REQUEST_TIMEOUT_MS = 15000
const REFRESH_LEEWAY_MS  = 60_000 // renova quando faltar < 60s para expirar

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown
  logErrors?: boolean
}

interface ApiContext {
  token:        string | null
  userId:       string | null
  refreshToken: string | null
  expiresAt:    number | null
}

const AUTH_STORAGE_KEY = "mediconnect:auth"

// Hidrata o contexto da API diretamente do localStorage no init do modulo.
// Sem isso, hooks filhos (usePatients/useAppointments/...) disparam o primeiro
// fetch antes do useEffect do AuthProvider rodar, e as requests saem sem token.
function loadInitialContext(): ApiContext {
  try {
    if (typeof localStorage === "undefined") {
      return { token: null, userId: null, refreshToken: null, expiresAt: null }
    }
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return { token: null, userId: null, refreshToken: null, expiresAt: null }
    const parsed = JSON.parse(raw) as {
      token?:        string | null
      refreshToken?: string | null
      expiresAt?:    number | null
      user?:         { id?: string } | null
    }
    return {
      token:        parsed.token ?? null,
      userId:       parsed.user?.id ?? null,
      refreshToken: parsed.refreshToken ?? null,
      expiresAt:    parsed.expiresAt ?? null,
    }
  } catch {
    return { token: null, userId: null, refreshToken: null, expiresAt: null }
  }
}

let _ctx: ApiContext = loadInitialContext()
let _onUnauthorized: (() => void) | null = null
let _refresher: (() => Promise<string | null>) | null = null
let _refreshPromise: Promise<string | null> | null = null
// Quando o refresh_token vira invalido (HTTP 400 em /auth/v1/token), evitamos
// re-chamar o refresher (que entraria em loop) ate que a sessao seja recriada.
let _refreshExhausted = false

function isLocalToken(token: string | null): boolean {
  return token?.startsWith("local-") ?? false
}

export function setApiContext(ctx: Partial<ApiContext>) {
  _ctx = {
    token:        ctx.token        ?? null,
    userId:       ctx.userId       ?? null,
    refreshToken: ctx.refreshToken ?? null,
    expiresAt:    ctx.expiresAt    ?? null,
  }
  // Qualquer mudanca de sessao (login novo, refresh bem sucedido) reseta a trava.
  _refreshExhausted = false
}

export function getApiUserId(): string | null { return _ctx.userId }

export function getApiToken(): string | null { return _ctx.token }

export function setUnauthorizedHandler(handler: () => void) {
  _onUnauthorized = handler
}

export function setSessionRefresher(refresher: (() => Promise<string | null>) | null) {
  _refresher = refresher
}

async function tryRefresh(): Promise<string | null> {
  if (_refreshExhausted) return null
  if (!_refresher || !_ctx.refreshToken || isLocalToken(_ctx.token)) return null
  if (_refreshPromise) return _refreshPromise

  _refreshPromise = _refresher()
    .catch((err) => {
      console.warn("[api] refresh de sessao falhou:", err)
      // refresh_token invalidado: marca a trava para evitar novos retries em loop.
      _refreshExhausted = true
      return null
    })
    .finally(() => { _refreshPromise = null })

  return _refreshPromise
}

async function ensureFreshToken(): Promise<void> {
  if (!_ctx.token || isLocalToken(_ctx.token)) return
  if (!_ctx.expiresAt) return
  if (Date.now() + REFRESH_LEEWAY_MS < _ctx.expiresAt) return
  await tryRefresh()
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

function parseErrorMessage(raw: string, status = 0): string {
  if (!raw) return ""
  const sanitizedDb = sanitizeDatabaseMessage(raw)
  if (sanitizedDb) return sanitizedDb
  const problem = parseProblemDetails(raw)
  const fromProblem = messageFromProblemDetails(status, problem)
  if (fromProblem) return fromProblem
  const fallback = problem.detail ?? problem.message ?? problem.title ?? problem.error ?? raw
  return sanitizeDatabaseMessage(fallback) ?? fallback
}

async function performFetch(path: string, options: RequestOptions): Promise<Response> {
  if (SUPABASE_CONFIG_ERROR) {
    throw new ApiError(0, SUPABASE_CONFIG_ERROR)
  }
  const { body, ...rest } = options
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept":       "application/json, application/problem+json",
    "apikey":       SUPABASE_ANON_KEY,
    ...(rest.headers as Record<string, string> ?? {}),
  }
  if (_ctx.token && !isLocalToken(_ctx.token)) {
    headers["Authorization"] = `Bearer ${_ctx.token}`
  }

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(`${SUPABASE_URL}${path}`, {
      ...rest,
      headers,
      signal: rest.signal ?? controller.signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } finally {
    window.clearTimeout(timeoutId)
  }
}

/**
 * Apenas paths "puramente autenticados" devem derrubar a sessao em 401:
 * - /rest/v1/*  → PostgREST so retorna 401 quando o JWT esta expirado/invalido.
 * - /auth/v1/*  → endpoints de autenticacao do GoTrue.
 * Edge Functions (/functions/v1/*) tambem podem retornar 401 por motivos de
 * negocio (permissao, payload), entao nao devem disparar logout automatico.
 */
function shouldLogoutOnUnauthorized(path: string): boolean {
  return path.startsWith("/rest/v1/") || path.startsWith("/auth/v1/")
}

export async function apiRequest<T>(
  path:    string,
  options: RequestOptions = {},
): Promise<T> {
  const { logErrors = true } = options

  await ensureFreshToken()

  let res: Response
  try {
    res = await performFetch(path, options)
  } catch {
    throw connectionError()
  }

  // Em 401 com refresh_token disponivel, tenta renovar a sessao e refazer a request uma unica vez.
  if (res.status === 401 && _ctx.refreshToken && !isLocalToken(_ctx.token)) {
    const newToken = await tryRefresh()
    if (newToken) {
      try {
        res = await performFetch(path, options)
      } catch {
        throw connectionError()
      }
    }
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => res.statusText)
    if (
      res.status === 401 &&
      _onUnauthorized &&
      !isLocalToken(_ctx.token) &&
      shouldLogoutOnUnauthorized(path)
    ) {
      _onUnauthorized()
    }
    const errorMsg = parseErrorMessage(raw, res.status) || res.statusText
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

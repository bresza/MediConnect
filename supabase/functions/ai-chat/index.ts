// ─────────────────────────────────────────────────────────────────
// Edge Function: ai-chat
// Proxy seguro para a OpenAI Chat Completions API.
// A chave OPENAI_API_KEY fica como secret do projeto Supabase
// e NUNCA e exposta ao navegador.
//
// Deploy:
//   supabase functions deploy ai-chat
//   supabase secrets set OPENAI_API_KEY=sk-...
// ─────────────────────────────────────────────────────────────────

// Tipos minimos do Deno para o TS local nao reclamar.
// Em runtime no Supabase isso e fornecido automaticamente.
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

// `AI_CHAT_ALLOWED_ORIGIN` aceita "*" ou uma lista separada por virgula.
// Em dev sem nada configurado, ja liberamos localhost/127.0.0.1 para o Vite.
const DEV_FALLBACK_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]

const RAW_ORIGIN_ENV = Deno.env.get("AI_CHAT_ALLOWED_ORIGIN")?.trim() ?? ""
const ALLOW_LIST = RAW_ORIGIN_ENV
  ? RAW_ORIGIN_ENV.split(",").map((o) => o.trim()).filter(Boolean)
  : []
const ALLOW_ANY = RAW_ORIGIN_ENV === "" || ALLOW_LIST.includes("*")

function resolveAllowedOrigin(requestOrigin: string | null): string {
  if (ALLOW_ANY) return requestOrigin || "*"
  if (requestOrigin && ALLOW_LIST.includes(requestOrigin)) return requestOrigin
  if (requestOrigin && DEV_FALLBACK_ORIGINS.includes(requestOrigin)) return requestOrigin
  return ALLOW_LIST[0] ?? "*"
}

function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin":  resolveAllowedOrigin(req.headers.get("Origin")),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age":       "86400",
    "Vary":                         "Origin",
  }
}

type Role = "system" | "user" | "assistant"
interface Message { role: Role; content: string }

interface RequestBody {
  messages?:    Message[]
  model?:       string
  temperature?: number
  max_tokens?:  number
}

interface OpenAIChoice {
  index: number
  finish_reason: string | null
  message: { role: "assistant"; content: string | null }
}
interface OpenAIResponse {
  id?:      string
  model?:   string
  choices?: OpenAIChoice[]
  usage?:   { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  error?:   { message?: string; type?: string; code?: string }
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function isValidMessage(m: unknown): m is Message {
  if (!m || typeof m !== "object") return false
  const obj = m as Record<string, unknown>
  return (
    (obj.role === "system" || obj.role === "user" || obj.role === "assistant") &&
    typeof obj.content === "string"
  )
}

interface AuthUser {
  id?: string
  is_anonymous?: boolean
  aud?: string
  role?: string
}

/**
 * Gateway JWT verification is off (`verify_jwt = false` / `--no-verify-jwt`)
 * so CORS preflight can succeed. This must reject anything that is not a
 * real logged-in user — a header that merely looks like `Bearer …` (or the
 * public anon key) is not enough.
 */
async function requireLoggedInUser(
  req: Request,
  cors: Record<string, string>,
): Promise<Response | null> {
  const auth = req.headers.get("Authorization") ?? ""
  if (!/^bearer\s+\S+/i.test(auth)) {
    return json({ error: "Missing bearer token" }, 401, cors)
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  if (!supabaseUrl || !anonKey) {
    return json({ error: "Configuracao de autenticacao ausente no servidor." }, 500, cors)
  }

  let userRes: Response
  try {
    userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: auth,
        apikey: anonKey,
      },
    })
  } catch {
    return json({ error: "Falha ao validar a sessao." }, 401, cors)
  }

  if (!userRes.ok) {
    return json({ error: "Sessao invalida. Faca login novamente." }, 401, cors)
  }

  const user = await userRes.json().catch(() => null) as AuthUser | null
  if (!user?.id || user.is_anonymous || user.role === "anon" || user.aud === "anon") {
    return json({ error: "Sessao invalida. Faca login novamente." }, 401, cors)
  }

  return null
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req)

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors })
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, cors)
  }

  const unauthorized = await requireLoggedInUser(req, cors)
  if (unauthorized) return unauthorized

  const apiKey = Deno.env.get("OPENAI_API_KEY")
  if (!apiKey) {
    return json({ error: "OPENAI_API_KEY nao configurada no servidor." }, 500, cors)
  }

  let payload: RequestBody = {}
  try {
    payload = await req.json() as RequestBody
  } catch {
    return json({ error: "JSON invalido." }, 400, cors)
  }

  const messages = Array.isArray(payload.messages) ? payload.messages.filter(isValidMessage) : []
  if (messages.length === 0) {
    return json({ error: "Lista de mensagens vazia ou invalida." }, 400, cors)
  }

  const model       = typeof payload.model === "string" && payload.model.trim() ? payload.model : "gpt-4o-mini"
  const temperature = typeof payload.temperature === "number" && payload.temperature >= 0 && payload.temperature <= 2 ? payload.temperature : 0.4
  const maxTokens   = typeof payload.max_tokens === "number" && payload.max_tokens > 0 && payload.max_tokens <= 4096 ? Math.floor(payload.max_tokens) : 600

  let res: Response
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: `Falha de rede ao chamar OpenAI: ${msg}` }, 502, cors)
  }

  const raw = await res.text().catch(() => "")
  let parsed: OpenAIResponse | null = null
  try { parsed = raw ? JSON.parse(raw) as OpenAIResponse : null } catch { parsed = null }

  if (!res.ok) {
    const message = parsed?.error?.message
      ?? (res.status === 401 ? "Chave da OpenAI invalida ou nao autorizada."
        : res.status === 429 ? "Limite de uso da OpenAI atingido."
        : `Erro ${res.status} ao consultar a OpenAI.`)
    return json({ error: message }, res.status, cors)
  }

  const content = parsed?.choices?.[0]?.message?.content?.trim() ?? ""
  if (!content) return json({ error: "OpenAI nao retornou conteudo." }, 502, cors)

  return json({
    content,
    model: parsed?.model ?? model,
    usage: parsed?.usage,
  }, 200, cors)
})

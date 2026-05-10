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

const ALLOW_ORIGIN = Deno.env.get("AI_CHAT_ALLOWED_ORIGIN") ?? "*"

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Vary":                         "Origin",
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
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

Deno.serve(async (req) => {
  // Preflight CORS: precisa retornar 200/204 sem exigir Authorization,
  // se nao o browser bloqueia a requisicao real.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  // `verify_jwt = false` no config.toml libera o preflight, mas ainda exigimos
  // Bearer JWT aqui para impedir uso anonimo da Edge Function.
  const auth = req.headers.get("Authorization") ?? ""
  if (!auth.toLowerCase().startsWith("bearer ") || auth.length < 16) {
    return json({ error: "Missing bearer token" }, 401)
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY")
  if (!apiKey) {
    return json({ error: "OPENAI_API_KEY nao configurada no servidor." }, 500)
  }

  let payload: RequestBody = {}
  try {
    payload = await req.json() as RequestBody
  } catch {
    return json({ error: "JSON invalido." }, 400)
  }

  const messages = Array.isArray(payload.messages) ? payload.messages.filter(isValidMessage) : []
  if (messages.length === 0) {
    return json({ error: "Lista de mensagens vazia ou invalida." }, 400)
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
    return json({ error: `Falha de rede ao chamar OpenAI: ${msg}` }, 502)
  }

  const raw = await res.text().catch(() => "")
  let parsed: OpenAIResponse | null = null
  try { parsed = raw ? JSON.parse(raw) as OpenAIResponse : null } catch { parsed = null }

  if (!res.ok) {
    const message = parsed?.error?.message
      ?? (res.status === 401 ? "Chave da OpenAI invalida ou nao autorizada."
        : res.status === 429 ? "Limite de uso da OpenAI atingido."
        : `Erro ${res.status} ao consultar a OpenAI.`)
    return json({ error: message }, res.status)
  }

  const content = parsed?.choices?.[0]?.message?.content?.trim() ?? ""
  if (!content) return json({ error: "OpenAI nao retornou conteudo." }, 502)

  return json({
    content,
    model: parsed?.model ?? model,
    usage: parsed?.usage,
  })
})

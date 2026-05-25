// ─────────────────────────────────────────────────────────────────
// AI Assistant — cliente do MediConnect.
//
// Providers suportados (todos rodam direto do front-end):
//
//   1) MODO GROQ (recomendado quando voce nao tem back-end):
//      Chama https://api.groq.com/openai/v1/chat/completions direto
//      do browser via `VITE_GROQ_API_KEY`. Tier free generoso (ate
//      ~30 RPM / 14400 RPD em llama-3.3-70b-versatile, sem cartao de
//      credito). CORS aberto, API compativel com OpenAI.
//
//   2) MODO GEMINI: requer chave do Google AI Studio. Free tier
//      depende do projeto/billing (alguns retornam `limit: 0`).
//
//   3) MODO DIRETO OPENAI (`VITE_OPENAI_API_KEY`): chama
//      https://api.openai.com/v1/chat/completions diretamente. Custo
//      pago.
//
//   4) MODO PROXY: chama a Edge Function `ai-chat` do Supabase. A
//      chave fica como secret no servidor e NAO viaja no bundle.
//
//   5) MODO PUTER (opt-in via VITE_AI_PROVIDER=puter): provider front
//      only que exige login do USUARIO FINAL em puter.com. Util apenas
//      em demos isoladas; nao usar para o produto.
// ─────────────────────────────────────────────────────────────────

import { ApiError, apiRequest, SUPABASE_URL, SUPABASE_ANON_KEY } from "./api"
import type { UserRole } from "../types"

export type ChatRole = "system" | "user" | "assistant"

export interface ChatMessage {
  role:    ChatRole
  content: string
}

export type AIMode = "groq" | "gemini" | "direct" | "proxy" | "puter" | "none"

const DEFAULT_MODEL      = (import.meta.env.VITE_OPENAI_MODEL      ?? "gpt-4o-mini") as string
const DEFAULT_MAX_TOKENS = Number(import.meta.env.VITE_OPENAI_MAX_TOKENS ?? 600)
const DIRECT_OPENAI_KEY  = (import.meta.env.VITE_OPENAI_API_KEY    ?? "").trim()
const GEMINI_KEY         = (import.meta.env.VITE_GEMINI_API_KEY    ?? "").trim()
const GEMINI_MODEL       = (import.meta.env.VITE_GEMINI_MODEL      ?? "gemini-2.0-flash") as string
const GROQ_KEY           = (import.meta.env.VITE_GROQ_API_KEY      ?? "").trim()
const GROQ_MODEL         = (import.meta.env.VITE_GROQ_MODEL        ?? "llama-3.3-70b-versatile") as string
/** Modelos a tentar caso o configurado seja descontinuado (Groq aposenta IDs com frequencia). */
const GROQ_MODEL_FALLBACKS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama3-70b-8192",
  "llama3-8b-8192",
  "mixtral-8x7b-32768",
] as const
// Puter.js exige login do usuario final em puter.com — somente opt-in explicito via VITE_AI_PROVIDER=puter.
const PUTER_ENABLED      = (import.meta.env.VITE_PUTER_AI_ENABLED  ?? "false").toString().toLowerCase() === "true"
const PUTER_MODEL        = (import.meta.env.VITE_PUTER_AI_MODEL    ?? "gpt-4o-mini") as string
/**
 * Modelos a tentar em ordem caso o configurado retorne 404 (modelo nao existe)
 * ou 429 com `limit: 0` (modelo nao disponivel no free tier desta chave).
 * Cada projeto Google tem um conjunto diferente de modelos com tier free,
 * entao iteramos do mais barato para o mais robusto.
 */
const GEMINI_MODEL_FALLBACKS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-8b-latest",
  "gemini-2.5-flash",
  "gemini-1.5-pro-latest",
] as const
// Provider explicito via env: `gemini | direct | proxy | auto`.
const FORCED_PROVIDER    = (import.meta.env.VITE_AI_PROVIDER ?? "auto").toString().toLowerCase()

interface AIChatProxyResponse {
  content: string
  model?:  string
  usage?:  { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  error?:  string
}

interface OpenAIDirectResponse {
  choices?: { message?: { content?: string | null } }[]
  model?:   string
  usage?:   { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  error?:   { message?: string }
}

interface GeminiCandidatePart {
  text?: string
}
interface GeminiCandidate {
  content?: { parts?: GeminiCandidatePart[]; role?: string }
  finishReason?: string
}
interface GeminiResponse {
  candidates?: GeminiCandidate[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; status?: string; code?: number }
}

/** Provider efetivo, considerando `VITE_AI_PROVIDER` se setado. */
export function getAIMode(): AIMode {
  if (FORCED_PROVIDER === "groq"   && GROQ_KEY)         return "groq"
  if (FORCED_PROVIDER === "gemini" && GEMINI_KEY)       return "gemini"
  if (FORCED_PROVIDER === "direct" && DIRECT_OPENAI_KEY) return "direct"
  if (FORCED_PROVIDER === "puter"  && PUTER_ENABLED)    return "puter"
  if (FORCED_PROVIDER === "proxy"  && SUPABASE_URL && SUPABASE_ANON_KEY) return "proxy"
  if (FORCED_PROVIDER !== "auto" && FORCED_PROVIDER !== "")              return "none"
  // Ordem automatica: Groq (free) → Gemini → OpenAI direto → Proxy.
  // Puter NAO entra em modo automatico porque exige login do usuario final.
  if (GROQ_KEY)                                return "groq"
  if (GEMINI_KEY)                              return "gemini"
  if (DIRECT_OPENAI_KEY)                       return "direct"
  if (SUPABASE_URL && SUPABASE_ANON_KEY)       return "proxy"
  if (PUTER_ENABLED)                           return "puter"
  return "none"
}

/** True quando algum provider esta configurado. */
export function isAIConfigured(): boolean {
  return getAIMode() !== "none"
}

export function getAIModel(): string {
  const m = getAIMode()
  if (m === "groq")   return GROQ_MODEL
  if (m === "gemini") return GEMINI_MODEL
  if (m === "puter")  return PUTER_MODEL
  return DEFAULT_MODEL
}

// ── System prompts por perfil ─────────────────────────────────────
const BASE_PROMPT = [
  "Voce e o assistente virtual do MediConnect, um sistema de gestao para clinicas.",
  "Responda sempre em portugues do Brasil, de forma direta, objetiva e gentil.",
  "Nao invente dados clinicos, financeiros ou pessoais que nao tenham sido informados na conversa.",
  "Quando o usuario pedir algo fora do escopo do MediConnect, oriente-o brevemente e volte ao foco.",
  "Nao faca diagnosticos definitivos nem prescreva medicamentos por conta propria.",
  "Sempre que houver risco clinico, recomende avaliacao presencial com um profissional de saude.",
].join(" ")

const ROLE_PROMPTS: Record<UserRole, string> = {
  doctor: [
    "Voce esta auxiliando um(a) MEDICO(a) da clinica.",
    "Pode sugerir diferenciais diagnosticos, hipoteses, codigos CID-10, condutas, posologias e exames de apoio,",
    "sempre como sugestao de raciocinio clinico, deixando claro que a decisao final e do(a) profissional.",
    "Pode ajudar a redigir laudos, prontuarios, receitas, anamneses e mensagens para pacientes.",
    "Use linguagem tecnica quando solicitado e linguagem leiga quando o medico pedir explicacao para paciente.",
  ].join(" "),
  manager: [
    "Voce esta auxiliando um(a) GESTOR(A) da clinica.",
    "Foque em gestao operacional: KPIs, agendamentos, equipe, financeiro, comunicacao interna e fluxos administrativos.",
    "Quando houver um resumo de dados da sessao (API) no contexto, use-o para numeros e listagens; nao invente registros alem desse resumo.",
    "Pode sugerir templates de relatorios, metas, plano de acao, scripts de comunicacao e checklists de processos.",
  ].join(" "),
  financial: [
    "Voce esta auxiliando uma pessoa do FINANCEIRO da clinica.",
    "Foque em cobranca, conciliacao, inadimplencia, convenios, recibos, fluxo de caixa e relatorios financeiros.",
    "Nao acesse dados clinicos. Trate informacoes financeiras com confidencialidade.",
  ].join(" "),
  secretary: [
    "Voce esta auxiliando uma SECRETARIA(O) da clinica.",
    "Foque em agendamento, confirmacao de consultas, cadastro de pacientes, comunicacao via WhatsApp/SMS/e-mail,",
    "scripts de atendimento, etiqueta no telefone, organizacao de fila e orientacao geral ao paciente.",
    "Nao oferece orientacao clinica: encaminhe duvidas medicas ao(a) profissional responsavel.",
  ].join(" "),
  admin: [
    "Voce esta auxiliando um(a) ADMINISTRADOR(A) do sistema MediConnect.",
    "Pode ajudar com configuracoes, permissoes, modelos de documentos, dicas de uso e boas praticas operacionais.",
    "Nao se envolva em decisoes clinicas individuais.",
  ].join(" "),
  patient: [
    "Voce esta auxiliando um(a) PACIENTE da clinica.",
    "Oferecer informacoes gerais sobre preparo de exames, agendamento, cuidados gerais e orientacoes pos-consulta",
    "que o(a) medico(a) ja tenha indicado.",
    "NUNCA faca diagnostico, nao prescreva medicamentos e nao sugira doses. Em caso de sintoma novo ou agravamento,",
    "oriente a procurar atendimento medico ou servico de urgencia.",
    "Use linguagem simples, acolhedora e sem termos tecnicos quando possivel.",
  ].join(" "),
}

export interface BuildSystemPromptInput {
  role:        UserRole
  userName?:   string
  clinicName?: string
  /** Resumo dos dados da API (sessao atual) injetado no prompt do sistema. */
  apiContextSnapshot?: string
}

/** Perguntas sugeridas na tela do assistente, por perfil de usuario. */
export const AI_STARTERS_BY_ROLE: Record<UserRole, string[]> = {
  doctor: [
    "Sugira diferenciais para cefaleia recorrente com fotofobia.",
    "Como devo estruturar a anamnese de paciente diabético em primeira consulta?",
    "Quais códigos CID-10 são mais usados para enxaqueca?",
  ],
  manager: [
    "Quais KPIs são essenciais para acompanhar a operação da clínica?",
    "Crie um checklist de boas práticas para a equipe de recepção.",
    "Sugira um modelo de comunicação interna semanal para a equipe.",
  ],
  financial: [
    "Quais são boas práticas para reduzir inadimplência em clínicas?",
    "Sugira um modelo de mensagem de cobrança amigável.",
    "Como organizar a conciliação bancária mensal?",
  ],
  secretary: [
    "Crie um script para confirmação de consulta por WhatsApp.",
    "Como organizar a agenda quando três pacientes pedem o mesmo horário?",
    "Sugira um e-mail de pré-consulta com orientações gerais.",
  ],
  admin: [
    "Quais permissões são recomendadas para o perfil secretaria?",
    "Como configurar lembretes automáticos de consulta?",
    "Sugira um plano de onboarding para um novo gestor da clínica.",
  ],
  patient: [
    "O que devo levar para a minha próxima consulta?",
    "Como faço para reagendar uma consulta?",
    "Quais são os preparos gerais para um exame de sangue?",
  ],
}

export function buildSystemPrompt({ role, userName, clinicName, apiContextSnapshot }: BuildSystemPromptInput): string {
  const intro = ROLE_PROMPTS[role] ?? ROLE_PROMPTS.secretary
  const parts = [
    BASE_PROMPT,
    intro,
    userName   ? `O usuario logado se chama "${userName}".`    : "",
    clinicName ? `A clinica atual e "${clinicName}".`           : "",
  ]
  if (apiContextSnapshot?.trim()) {
    parts.push(
      "Segue um resumo dos dados reais retornados pela API MediConnect/Supabase nesta sessao (mesmos dados das telas do usuario). " +
        "Use esse bloco para responder com precisao sobre contagens, nomes e agenda visiveis. " +
        "Nao invente registros fora deste bloco. Se algo nao aparecer, diga que nao consta nos dados carregados e sugira atualizar a pagina (botao Atualizar) ou consultar a tela correspondente.",
    )
    parts.push(apiContextSnapshot.trim())
  }
  return parts.filter(Boolean).join(" ")
}

// ── Chamada ao Chat Completions ───────────────────────────────────

export interface ChatRequestOptions {
  signal?:      AbortSignal
  temperature?: number
  maxTokens?:   number
  model?:       string
}

export class AIError extends Error {
  readonly cause?: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name  = "AIError"
    this.cause = cause
  }
}

// ── Groq (https://api.groq.com — compativel OpenAI, free tier sem cartao) ──
//
// Tenta o modelo configurado; em 400/404 (modelo descontinuado) percorre
// `GROQ_MODEL_FALLBACKS`. Outros erros sobem como AIError com mensagem PT-BR.
async function chatCompleteGroq(
  messages: ChatMessage[],
  options:  ChatRequestOptions,
): Promise<string> {
  const requested = options.model ?? GROQ_MODEL
  const tryModels = [...new Set([requested, ...GROQ_MODEL_FALLBACKS])]

  let lastMessage = ""
  let lastStatus  = 0

  for (const model of tryModels) {
    const body = {
      model,
      temperature: options.temperature ?? 0.4,
      max_tokens:  options.maxTokens   ?? DEFAULT_MAX_TOKENS,
      messages,
    }
    let res: Response
    try {
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${GROQ_KEY}`,
        },
        body:    JSON.stringify(body),
        signal:  options.signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new AIError(`Falha de rede ao chamar a API do Groq: ${msg}`, err)
    }

    const raw = await res.text().catch(() => "")
    let parsed: OpenAIDirectResponse | null = null
    try { parsed = raw ? JSON.parse(raw) as OpenAIDirectResponse : null } catch { parsed = null }

    // 400/404 com referencia a modelo (descontinuado, renomeado) — tenta proximo.
    if ((res.status === 400 || res.status === 404) &&
        /model|decommission|not\s+found|does\s+not\s+exist/i.test(parsed?.error?.message ?? raw)) {
      lastStatus  = res.status
      lastMessage = parsed?.error?.message ?? `Modelo Groq nao encontrado: ${model}`
      continue
    }

    if (!res.ok) {
      const message = parsed?.error?.message
        ?? (res.status === 401 ? "Chave do Groq invalida (VITE_GROQ_API_KEY)."
          : res.status === 403 ? "Chave do Groq sem permissao."
          : res.status === 429 ? "Limite de uso do Groq atingido. Aguarde alguns segundos."
          : `Erro ${res.status} ao consultar o Groq.`)
      throw new AIError(message)
    }

    const content = parsed?.choices?.[0]?.message?.content?.trim() ?? ""
    if (!content) throw new AIError("O Groq nao retornou conteudo.")
    return content
  }

  throw new AIError(
    lastMessage ||
      `Nenhum modelo Groq respondeu. Defina VITE_GROQ_MODEL com um modelo valido (ex.: llama-3.1-8b-instant). Ultimo status: ${lastStatus}.`,
  )
}

async function chatCompleteDirect(
  messages: ChatMessage[],
  options:  ChatRequestOptions,
): Promise<string> {
  const body = {
    model:       options.model       ?? DEFAULT_MODEL,
    temperature: options.temperature ?? 0.4,
    max_tokens:  options.maxTokens   ?? DEFAULT_MAX_TOKENS,
    messages,
  }
  let res: Response
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${DIRECT_OPENAI_KEY}`,
      },
      body:   JSON.stringify(body),
      signal: options.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err
    const msg = err instanceof Error ? err.message : String(err)
    throw new AIError(`Falha de rede ao chamar a OpenAI: ${msg}`, err)
  }

  const raw = await res.text().catch(() => "")
  let parsed: OpenAIDirectResponse | null = null
  try { parsed = raw ? JSON.parse(raw) as OpenAIDirectResponse : null } catch { parsed = null }

  if (!res.ok) {
    const message = parsed?.error?.message
      ?? (res.status === 401 ? "Chave da OpenAI invalida ou nao autorizada (VITE_OPENAI_API_KEY)."
        : res.status === 429 ? "Limite de uso da OpenAI atingido."
        : `Erro ${res.status} ao consultar a OpenAI.`)
    throw new AIError(message)
  }

  const content = parsed?.choices?.[0]?.message?.content?.trim() ?? ""
  if (!content) throw new AIError("A OpenAI nao retornou conteudo.")
  return content
}

async function chatCompleteProxy(
  messages: ChatMessage[],
  options:  ChatRequestOptions,
): Promise<string> {
  const body = {
    model:       options.model       ?? DEFAULT_MODEL,
    temperature: options.temperature ?? 0.4,
    max_tokens:  options.maxTokens   ?? DEFAULT_MAX_TOKENS,
    messages,
  }
  try {
    const res = await apiRequest<AIChatProxyResponse>("/functions/v1/ai-chat", {
      method:    "POST",
      body,
      signal:    options.signal,
      logErrors: false,
    })

    if (res?.error) throw new AIError(res.error)
    const content = res?.content?.trim()
    if (!content) throw new AIError("O assistente nao retornou conteudo.")
    return content
  } catch (err) {
    if (err instanceof AIError) throw err
    if (err instanceof DOMException && err.name === "AbortError") throw err
    if (err instanceof ApiError) {
      if (err.status === 0) {
        throw new AIError(
          "Nao foi possivel falar com a Edge Function ai-chat (CORS/rede). " +
          "Sem acesso ao back-end, voce pode habilitar o modo direto definindo VITE_OPENAI_API_KEY no .env (a chave fica visivel no bundle).",
        )
      }
      if (err.status === 404) {
        throw new AIError(
          "Edge Function ai-chat nao encontrada. Peca ao time de back-end para fazer o deploy, ou habilite o modo direto via VITE_OPENAI_API_KEY.",
        )
      }
      if (err.status === 401 || err.status === 403) {
        throw new AIError("Sua sessao expirou. Faca login novamente para usar o assistente.")
      }
      throw new AIError(err.message)
    }
    const msg = err instanceof Error ? err.message : "Erro inesperado ao consultar o assistente."
    throw new AIError(msg, err)
  }
}

// ── Gemini direto do browser (Google Generative Language API) ─────
//
// Mapeamento de mensagens:
//   - role "system"    -> `systemInstruction` (Gemini trata como instrucao global)
//   - role "user"      -> `contents[].role = "user"`
//   - role "assistant" -> `contents[].role = "model"` (vocabulario do Gemini)
//
// Multiplas mensagens "system" sao concatenadas em uma so instrucao.
async function chatCompleteGemini(
  messages: ChatMessage[],
  options:  ChatRequestOptions,
): Promise<string> {
  const systemParts: string[] = []
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = []
  for (const m of messages) {
    if (m.role === "system") {
      if (m.content.trim()) systemParts.push(m.content.trim())
    } else {
      contents.push({
        role:  m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })
    }
  }
  if (contents.length === 0) {
    throw new AIError("Nenhuma mensagem de usuario para enviar ao Gemini.")
  }

  const requested = options.model ?? GEMINI_MODEL
  const tryModels = [...new Set([requested, ...GEMINI_MODEL_FALLBACKS])]

  const bodyBase = {
    contents,
    systemInstruction: systemParts.length
      ? { role: "system", parts: [{ text: systemParts.join("\n\n") }] }
      : undefined,
    generationConfig: {
      temperature:     options.temperature ?? 0.4,
      maxOutputTokens: options.maxTokens   ?? DEFAULT_MAX_TOKENS,
    },
  }

  let lastMessage = ""
  let lastStatus  = 0

  for (const model of tryModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    let res: Response
    try {
      res = await fetch(url, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "x-goog-api-key": GEMINI_KEY,
        },
        body:    JSON.stringify(bodyBase),
        signal:  options.signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err
      const msg = err instanceof Error ? err.message : String(err)
      throw new AIError(`Falha de rede ao chamar a API do Gemini: ${msg}`, err)
    }

    const raw = await res.text().catch(() => "")
    let parsed: GeminiResponse | null = null
    try { parsed = raw ? JSON.parse(raw) as GeminiResponse : null } catch { parsed = null }

    if (res.status === 404) {
      lastStatus  = 404
      lastMessage = parsed?.error?.message ?? `Modelo nao encontrado: ${model}`
      continue
    }

    // 429 com `limit: 0` (ou mensagem "free_tier ... limit: 0") significa
    // que ESTE modelo nao tem free tier para esta chave/projeto — nao e
    // rate limit transitorio. Tentamos o proximo modelo da lista.
    if (res.status === 429) {
      const rawMessage = parsed?.error?.message ?? raw
      const noFreeTier = /free[_ ]tier[\s\S]*limit:\s*0|limit:\s*0[\s\S]*free[_ ]tier/i.test(rawMessage)
      if (noFreeTier) {
        lastStatus  = 429
        lastMessage = `Modelo ${model} nao esta no tier free desta chave.`
        continue
      }
      // Rate limit transitorio: nao tentamos outros modelos para nao
      // consumir cota; reportamos com mensagem amigavel.
      const retryAfter = rawMessage.match(/retry in ([\d.]+)s/i)?.[1]
      throw new AIError(
        retryAfter
          ? `Gemini esta limitando as requisicoes. Tente novamente em ${Math.ceil(Number(retryAfter))}s.`
          : "Cota do Gemini atingida temporariamente. Aguarde alguns segundos e tente de novo.",
      )
    }

    if (!res.ok) {
      const message = parsed?.error?.message
        ?? (res.status === 400 ? "Requisicao invalida para a API do Gemini."
          : res.status === 401 || res.status === 403 ? "Chave do Gemini invalida ou sem permissao (VITE_GEMINI_API_KEY)."
          : `Erro ${res.status} ao consultar o Gemini.`)
      throw new AIError(message)
    }

    if (parsed?.promptFeedback?.blockReason) {
      throw new AIError(`Resposta bloqueada pelo Gemini (${parsed.promptFeedback.blockReason}).`)
    }

    const content = parsed?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? ""
    if (!content) throw new AIError("O Gemini nao retornou conteudo.")
    return content
  }

  if (lastStatus === 429) {
    throw new AIError(
      "Nenhum modelo Gemini disponivel no tier free para esta chave. " +
      "Habilite billing no projeto Google Cloud ou aguarde a renovacao diaria da cota.",
    )
  }
  throw new AIError(
    lastMessage ||
      `Nenhum modelo Gemini respondeu. Defina VITE_GEMINI_MODEL no .env com um modelo valido (ex.: gemini-1.5-flash-latest). Ultimo status: ${lastStatus}.`,
  )
}

// ── Puter.js (front-only, sem chave) ──────────────────────────────
//
// Puter.js (https://js.puter.com/v2/) expoe `window.puter.ai.chat(...)`
// que roteia para OpenAI/Claude/Gemini sem que o app precise de chave
// ou back-end. O usuario consome do "saldo" da conta Puter dele; sem
// conta, ha um pequeno saldo anonimo. Carregamos o script sob demanda
// na primeira chamada e cacheamos a Promise para nao recarregar.

interface PuterAiResponse {
  text?:     string
  content?:  string | { text?: string }[]
  message?: { content?: string | { text?: string }[]; role?: string }
}
interface PuterGlobal {
  ai?: {
    chat: (
      input: string | ChatMessage[],
      options?: { model?: string; temperature?: number; max_tokens?: number; stream?: boolean },
    ) => Promise<string | PuterAiResponse>
  }
}

let puterLoadPromise: Promise<PuterGlobal> | null = null

function loadPuter(): Promise<PuterGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new AIError("Puter.js exige ambiente de navegador."))
  }
  const w = window as unknown as { puter?: PuterGlobal }
  if (w.puter) return Promise.resolve(w.puter)
  if (puterLoadPromise) return puterLoadPromise

  puterLoadPromise = new Promise<PuterGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-mediconnect-puter]')
    const handleLoad = () => {
      const g = (window as unknown as { puter?: PuterGlobal }).puter
      if (g?.ai?.chat) resolve(g)
      else reject(new AIError("Puter.js carregou, mas a API ai.chat nao esta disponivel."))
    }
    const handleError = () => {
      puterLoadPromise = null
      reject(new AIError("Nao foi possivel carregar Puter.js (verifique conexao com js.puter.com)."))
    }
    if (existing) {
      existing.addEventListener("load",  handleLoad,  { once: true })
      existing.addEventListener("error", handleError, { once: true })
      return
    }
    const script = document.createElement("script")
    script.src   = "https://js.puter.com/v2/"
    script.async = true
    script.dataset.mediconnectPuter = "1"
    script.addEventListener("load",  handleLoad,  { once: true })
    script.addEventListener("error", handleError, { once: true })
    document.head.appendChild(script)
  })

  return puterLoadPromise
}

function extractPuterText(result: string | PuterAiResponse): string {
  if (typeof result === "string") return result.trim()
  if (result.text) return result.text.trim()
  const direct = result.content
  if (typeof direct === "string") return direct.trim()
  if (Array.isArray(direct)) return direct.map((p) => p.text ?? "").join("").trim()
  const inner = result.message?.content
  if (typeof inner === "string") return inner.trim()
  if (Array.isArray(inner)) return inner.map((p) => p.text ?? "").join("").trim()
  return ""
}

async function chatCompletePuter(
  messages: ChatMessage[],
  options:  ChatRequestOptions,
): Promise<string> {
  const puter = await loadPuter()
  if (!puter.ai?.chat) throw new AIError("Puter.js nao expos `ai.chat`.")

  // A API do Puter aceita o mesmo formato OpenAI (array de {role, content}).
  const result = await puter.ai.chat(messages, {
    model:       options.model       ?? PUTER_MODEL,
    temperature: options.temperature ?? 0.4,
    max_tokens:  options.maxTokens   ?? DEFAULT_MAX_TOKENS,
  })

  const text = extractPuterText(result)
  if (!text) throw new AIError("Puter.js nao retornou conteudo.")
  return text
}

export async function chatComplete(
  messages: ChatMessage[],
  options:  ChatRequestOptions = {},
): Promise<string> {
  const mode = getAIMode()
  if (mode === "none") {
    throw new AIError(
      "Assistente indisponivel: defina VITE_GROQ_API_KEY (recomendado), " +
      "VITE_GEMINI_API_KEY, VITE_OPENAI_API_KEY ou configure a Edge Function ai-chat.",
    )
  }
  if (!messages?.length) {
    throw new AIError("Nenhuma mensagem para enviar.")
  }

  if (mode === "groq")   return chatCompleteGroq(messages, options)
  if (mode === "gemini") return chatCompleteGemini(messages, options)
  if (mode === "direct") return chatCompleteDirect(messages, options)
  if (mode === "puter")  return chatCompletePuter(messages, options)
  return chatCompleteProxy(messages, options)
}

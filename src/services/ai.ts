// ─────────────────────────────────────────────────────────────────
// AI Assistant — cliente que consome o proxy seguro do MediConnect
// (Edge Function `ai-chat` no Supabase). A chave da OpenAI fica
// como secret do projeto Supabase e NUNCA viaja para o navegador.
// ─────────────────────────────────────────────────────────────────

import { ApiError, apiRequest, SUPABASE_URL, SUPABASE_ANON_KEY } from "./api"
import type { UserRole } from "../types"

export type ChatRole = "system" | "user" | "assistant"

export interface ChatMessage {
  role:    ChatRole
  content: string
}

// Modelo e teto de tokens sao apenas defaults de UI; o backend tambem
// valida/limita os valores antes de chamar a OpenAI.
const DEFAULT_MODEL      = (import.meta.env.VITE_OPENAI_MODEL      ?? "gpt-4o-mini") as string
const DEFAULT_MAX_TOKENS = Number(import.meta.env.VITE_OPENAI_MAX_TOKENS ?? 600)

interface AIChatProxyResponse {
  content: string
  model?:  string
  usage?:  { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  error?:  string
}

export function isAIConfigured(): boolean {
  // A chave fica no servidor; aqui basta termos o Supabase configurado.
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

export function getAIModel(): string {
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
    "Pode sugerir templates de relatorios, metas, plano de acao, scripts de comunicacao e checklists de processos.",
    "Nao acesse dados clinicos individuais a menos que o gestor informe explicitamente na conversa.",
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
}

export function buildSystemPrompt({ role, userName, clinicName }: BuildSystemPromptInput): string {
  const intro = ROLE_PROMPTS[role] ?? ROLE_PROMPTS.secretary
  const context = [
    BASE_PROMPT,
    intro,
    userName   ? `O usuario logado se chama "${userName}".`    : "",
    clinicName ? `A clinica atual e "${clinicName}".`           : "",
  ].filter(Boolean).join(" ")
  return context
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

export async function chatComplete(
  messages: ChatMessage[],
  options:  ChatRequestOptions = {},
): Promise<string> {
  if (!isAIConfigured()) {
    throw new AIError(
      "Assistente indisponivel: configure Supabase (.env do projeto) antes de usar.",
    )
  }
  if (!messages?.length) {
    throw new AIError("Nenhuma mensagem para enviar.")
  }

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
      // status 0 = falha de rede/CORS (Edge Function nao implantada, projeto pausado,
      // ou --no-verify-jwt nao aplicado fazendo o preflight ser bloqueado).
      if (err.status === 0 || err.status === 404) {
        throw new AIError(
          "Assistente indisponivel. Verifique se a Edge Function ai-chat foi implantada com --no-verify-jwt (veja supabase/functions/ai-chat/README.md).",
        )
      }
      if (err.status === 401 || err.status === 403) {
        throw new AIError(
          "Sua sessao expirou. Faca login novamente para usar o assistente.",
        )
      }
      throw new AIError(err.message)
    }
    const msg = err instanceof Error ? err.message : "Erro inesperado ao consultar o assistente."
    throw new AIError(msg, err)
  }
}

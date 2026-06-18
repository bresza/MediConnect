import { chatComplete, type ChatMessage } from "./ai"
import type { AppAIActions, AIToolResult } from "./aiActions"

const MAX_AGENT_STEPS = 6

const ACTION_JSON_RE =
  /\{\s*"action"\s*:\s*"([a-z_]+)"\s*,\s*"params"\s*:\s*(\{[\s\S]*?\})\s*\}/i

export interface AgentRunResult {
  reply: string
  toolLog: string[]
  pendingConfirmation?: AIToolResult["pendingAction"]
}

function extractActionFromText(text: string): { action: string; params: Record<string, unknown> } | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i)
  const candidate = fenced?.[1]?.trim() ?? trimmed
  const match = candidate.match(ACTION_JSON_RE)
  if (!match) return null
  try {
    const params = JSON.parse(match[2]) as Record<string, unknown>
    return { action: match[1].toLowerCase(), params }
  } catch {
    return null
  }
}

function buildAgentSystemAddon(toolsDescription: string, activePage: string): string {
  return [
    "",
    "=== MODO AGENTE (EXECUTAR AÇÕES NO SISTEMA) ===",
    "Você pode EXECUTAR ações reais no MediConnect, não apenas orientar.",
    `Página atual do usuário: ${activePage}.`,
    "Quando o usuário pedir para FAZER algo (agendar, cancelar, criar laudo, navegar, etc.),",
    "responda APENAS com um JSON válido (sem markdown, sem texto extra):",
    '{"action":"nome_da_ferramenta","params":{...}}',
    "Ferramentas disponíveis:",
    toolsDescription,
    "Após agendar consulta, o sistema envia SMS de confirmação automaticamente — não peça permissão para SMS.",
    "Após receber [Resultado da ação: ...], responda em português de forma natural ao usuário.",
    "Se faltar dados (data, hora, nome do paciente), pergunte antes de emitir o JSON.",
    "Para consultas médicas puramente informativas, responda em texto normal sem JSON.",
  ].join("\n")
}

/** Resumo curto após o usuário confirmar uma ação de escrita. */
export function formatConfirmedActionSummary(
  _action: string,
  result: AIToolResult,
): string {
  if (!result.ok) {
    return `Não foi possível concluir: ${result.message}`
  }

  const lines = ["Pronto! Resumo do que foi feito:"]
  if (result.summary) {
    lines.push(`• ${result.summary}`)
  } else {
    lines.push(`• ${result.message.split("\n")[0]}`)
  }

  if (result.smsSent) {
    lines.push("• SMS de confirmação enviado ao paciente.")
  } else if (result.smsNote) {
    lines.push(`• ${result.smsNote}`)
  }

  if (result.extraNotes?.length) {
    for (const note of result.extraNotes) lines.push(`• ${note}`)
  }

  return lines.join("\n")
}

export async function runAIAgentTurn(
  baseSystemPrompt: string,
  conversation: ChatMessage[],
  actions: AppAIActions,
  options?: {
    signal?: AbortSignal
    confirmedAction?: { action: string; params: Record<string, unknown> }
    maxTokens?: number
  },
): Promise<AgentRunResult> {
  const toolLog: string[] = []
  let pendingConfirmation: AIToolResult["pendingAction"]

  if (options?.confirmedAction) {
    const { action, params } = options.confirmedAction
    const result = await actions.executeTool(action, params, { confirmed: true })
    toolLog.push(`${action}: ${result.message}`)
    const reply = formatConfirmedActionSummary(action, result)
    return { reply, toolLog, pendingConfirmation: undefined }
  }

  const systemPrompt =
    baseSystemPrompt + buildAgentSystemAddon(actions.getToolsDescription(), actions.activePage)

  let messages: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...conversation]
  const chatOpts = { signal: options?.signal, maxTokens: options?.maxTokens ?? 1500 }

  for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
    const raw = await chatComplete(messages, chatOpts)
    const parsed = extractActionFromText(raw)

    if (!parsed) {
      return { reply: raw, toolLog, pendingConfirmation }
    }

    const result = await actions.executeTool(parsed.action, parsed.params)

    if (result.needsConfirmation && result.pendingAction) {
      return {
        reply: `Preciso da sua confirmação para: ${result.pendingAction.summary}`,
        toolLog,
        pendingConfirmation: result.pendingAction,
      }
    }

    toolLog.push(`${parsed.action}: ${result.message}`)

    if (result.ok && result.summary && !parsed.action.startsWith("list_") && parsed.action !== "refresh_data" && parsed.action !== "navigate" && parsed.action !== "navigate_portal") {
      return {
        reply: formatConfirmedActionSummary(parsed.action, result),
        toolLog,
        pendingConfirmation,
      }
    }

    messages = [
      ...messages,
      { role: "assistant", content: raw },
      { role: "user", content: `[Resultado da ação: ${result.ok ? "sucesso" : "erro"} — ${result.message}]` },
    ]
  }

  return {
    reply: "Executei várias ações. Verifique as telas do sistema e me diga se precisa de mais algo.",
    toolLog,
    pendingConfirmation,
  }
}

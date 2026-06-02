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
    "Quando o usuário pedir para FAZER algo (agendar, enviar mensagem, criar laudo, cancelar, navegar, etc.),",
    "responda APENAS com um JSON válido (sem markdown, sem texto extra):",
    '{"action":"nome_da_ferramenta","params":{...}}',
    "Ferramentas disponíveis:",
    toolsDescription,
    "Após receber [Resultado da ação: ...], responda em português de forma natural ao usuário.",
    "Se faltar dados (data, hora, nome do paciente), pergunte antes de emitir o JSON.",
    "Para consultas médicas puramente informativas, responda em texto normal sem JSON.",
  ].join("\n")
}

export async function runAIAgentTurn(
  baseSystemPrompt: string,
  conversation: ChatMessage[],
  actions: AppAIActions,
  options?: {
    signal?: AbortSignal
    confirmedAction?: { action: string; params: Record<string, unknown> }
  },
): Promise<AgentRunResult> {
  const toolLog: string[] = []
  let pendingConfirmation: AIToolResult["pendingAction"]

  if (options?.confirmedAction) {
    const result = await actions.executeTool(
      options.confirmedAction.action,
      options.confirmedAction.params,
      { confirmed: true },
    )
    toolLog.push(`${options.confirmedAction.action}: ${result.message}`)
    const followUp: ChatMessage[] = [
      { role: "system", content: baseSystemPrompt + buildAgentSystemAddon(actions.getToolsDescription(), actions.activePage) },
      ...conversation,
      { role: "user", content: `[Resultado da ação confirmada: ${result.message}]` },
    ]
    const reply = await chatComplete(followUp, { signal: options.signal })
    return { reply, toolLog, pendingConfirmation: undefined }
  }

  const systemPrompt =
    baseSystemPrompt + buildAgentSystemAddon(actions.getToolsDescription(), actions.activePage)

  let messages: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...conversation]

  for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
    const raw = await chatComplete(messages, { signal: options?.signal })
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

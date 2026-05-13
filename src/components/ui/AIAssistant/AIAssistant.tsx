import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ChatMessage } from "../../../services/ai"
import {
  AIError, buildSystemPrompt, chatComplete, getAIMode, getAIModel, isAIConfigured,
} from "../../../services/ai"
import type { User, UserRole } from "../../../types"
import styles from "./AIAssistant.module.css"

interface AIAssistantProps {
  currentUser: User
  clinicName?: string | null
  /** Resumo dos dados da API (sessao) para contextualizar respostas. */
  apiContextSnapshot?: string
}

// ── Sugestoes iniciais por perfil ─────────────────────────────────
const STARTERS: Record<UserRole, string[]> = {
  doctor: [
    "Sugira diferenciais para cefaleia recorrente com fotofobia.",
    "Como devo estruturar a anamnese de paciente diabetico em primeira consulta?",
    "Quais codigos CID-10 mais usados para enxaqueca?",
  ],
  manager: [
    "Quais KPIs sao essenciais para acompanhar a operacao da clinica?",
    "Crie um checklist de boas praticas para a equipe de recepcao.",
    "Sugira um modelo de comunicacao interna semanal para a equipe.",
  ],
  financial: [
    "Quais sao boas praticas para reduzir inadimplencia em clinicas?",
    "Sugira um modelo de mensagem de cobranca amigavel.",
    "Como organizar a conciliacao bancaria mensal?",
  ],
  secretary: [
    "Crie um script para confirmacao de consulta por WhatsApp.",
    "Como organizar a agenda quando tres pacientes pedem o mesmo horario?",
    "Sugira um e-mail de pre-consulta com orientacoes gerais.",
  ],
  admin: [
    "Quais permissoes sao recomendadas para o perfil secretaria?",
    "Como configurar lembretes automaticos de consulta?",
    "Sugira um plano de onboarding para um novo gestor da clinica.",
  ],
  patient: [
    "O que devo levar para a minha proxima consulta?",
    "Como faco para reagendar uma consulta?",
    "Quais sao os preparos gerais para um exame de sangue?",
  ],
}

const ROLE_LABEL: Record<UserRole, string> = {
  doctor:    "Modo medico",
  manager:   "Modo gestao",
  financial: "Modo financeiro",
  secretary: "Modo secretaria",
  admin:     "Modo administrador",
  patient:   "Modo paciente",
}

// Icone (Sparkles)
const SparkIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
  </svg>
)
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
)
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

interface UiMessage extends ChatMessage {
  id:    string
  error?: boolean
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function historyKey(userId: string): string {
  return `mediconnect:ai-history:${userId}`
}

function loadHistory(userId: string): UiMessage[] {
  try {
    const raw = localStorage.getItem(historyKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as UiMessage[]
    return Array.isArray(parsed) ? parsed.slice(-40) : []
  } catch {
    return []
  }
}

function saveHistory(userId: string, messages: UiMessage[]) {
  try {
    localStorage.setItem(historyKey(userId), JSON.stringify(messages.slice(-40)))
  } catch {
    // Storage indisponivel: ignora.
  }
}

export function AIAssistant({ currentUser, clinicName, apiContextSnapshot }: AIAssistantProps) {
  const [isOpen,    setIsOpen]    = useState(false)
  const [input,     setInput]     = useState("")
  const [messages,  setMessages]  = useState<UiMessage[]>(() => loadHistory(currentUser.id))
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const listRef  = useRef<HTMLDivElement | null>(null)

  const role = currentUser.role
  const configured = isAIConfigured()
  const mode       = getAIMode()

  const systemPrompt = useMemo(
    () =>
      buildSystemPrompt({
        role: currentUser.role,
        userName: currentUser.name,
        clinicName: clinicName ?? undefined,
        apiContextSnapshot: apiContextSnapshot ?? undefined,
      }),
    [currentUser.role, currentUser.name, clinicName, apiContextSnapshot],
  )

  const starters = STARTERS[role] ?? STARTERS.secretary

  // Persistencia local do historico ao mudar.
  useEffect(() => { saveHistory(currentUser.id, messages) }, [messages, currentUser.id])

  // Scroll automatico para o fim quando entra mensagem nova.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
  }, [messages, isOpen])

  // Cancela request pendente ao fechar a aba ou desmontar.
  useEffect(() => () => abortRef.current?.abort(), [])

  const handleSend = useCallback(async (rawText: string) => {
    const text = rawText.trim()
    if (!text || isLoading) return
    if (!configured) return

    const userMsg: UiMessage = { id: newId(), role: "user", content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput("")
    setIsLoading(true)

    const controller = new AbortController()
    abortRef.current = controller

    const payload: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...nextMessages.map(({ role: r, content }) => ({ role: r, content })),
    ]

    try {
      const reply = await chatComplete(payload, { signal: controller.signal })
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: reply }])
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      const message = err instanceof AIError ? err.message
        : err instanceof Error ? err.message
        : "Erro inesperado ao consultar o assistente."
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: message, error: true }])
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [messages, isLoading, configured, systemPrompt])

  function handleClear() {
    abortRef.current?.abort()
    setMessages([])
    try { localStorage.removeItem(historyKey(currentUser.id)) } catch { /* silencia */ }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void handleSend(input)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSend(input)
    }
  }

  return (
    <>
      {!isOpen && (
        <button
          className={styles.fab}
          onClick={() => setIsOpen(true)}
          aria-label="Abrir assistente"
          title="Assistente MediConnect"
          type="button"
        >
          <span className={styles.fabPulse} aria-hidden />
          <SparkIcon />
        </button>
      )}

      {isOpen && (
        <>
          <div className={styles.backdrop} onClick={() => setIsOpen(false)} aria-hidden />
          <div className={styles.panel} role="dialog" aria-label="Assistente MediConnect">
            <div className={styles.header}>
              <div className={styles.headerIcon}><SparkIcon size={18} /></div>
              <div className={styles.headerText}>
                <p className={styles.headerTitle}>Assistente MediConnect</p>
                <p className={styles.headerSubtitle}>
                  {ROLE_LABEL[role] ?? "Assistente"} · {getAIModel()}
                </p>
              </div>
              <div className={styles.headerActions}>
                {messages.length > 0 && (
                  <button className={styles.headerBtn} onClick={handleClear} title="Limpar conversa" type="button">
                    <TrashIcon />
                  </button>
                )}
                <button className={styles.headerBtn} onClick={() => setIsOpen(false)} title="Fechar" type="button">
                  <CloseIcon />
                </button>
              </div>
            </div>

            {!configured && (
              <div className={styles.warning}>
                Assistente nao configurado. Defina <code>VITE_GEMINI_API_KEY</code> (recomendado), <code>VITE_OPENAI_API_KEY</code> (OpenAI direto) ou configure a Edge Function <code>ai-chat</code> no Supabase.
              </div>
            )}

            {configured && mode === "groq" && (
              <div className={styles.disclaimer}>
                Modo Groq ativo: chamada direta do front-end com tier free generoso. A chave esta no bundle &mdash; restrinja por dominio em producao.
              </div>
            )}
            {configured && mode === "gemini" && (
              <div className={styles.disclaimer}>
                Modo Gemini ativo: a chave do Google esta no bundle do front. Restrinja a chave por dominio e mantenha cota baixa em producao.
              </div>
            )}
            {configured && mode === "direct" && (
              <div className={styles.disclaimer}>
                Modo direto ativo: a chave da OpenAI esta no bundle do front. Use apenas em demo; em producao, prefira a Edge Function <code>ai-chat</code>.
              </div>
            )}
            {configured && mode === "puter" && (
              <div className={styles.disclaimer}>
                Modo Puter.js ativo: <strong>exige login do usuario final</strong> em puter.com. Use apenas em demos isoladas.
              </div>
            )}

            {role === "patient" && (
              <div className={styles.disclaimer}>
                Este assistente fornece orientacoes gerais e nao substitui avaliacao medica. Em emergencias, procure um servico de saude.
              </div>
            )}

            <div className={styles.messages} ref={listRef}>
              {messages.length === 0 ? (
                <div className={styles.empty}>
                  <strong>Como posso ajudar?</strong>
                  <span>Faca uma pergunta ou comece com uma das sugestoes abaixo.</span>
                  <div className={styles.suggestions}>
                    {starters.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={styles.suggestion}
                        onClick={() => void handleSend(s)}
                        disabled={!configured || isLoading}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={[
                        styles.bubble,
                        m.role === "user"
                          ? styles.bubbleUser
                          : m.error
                            ? `${styles.bubbleAssistant} ${styles.bubbleError}`
                            : styles.bubbleAssistant,
                      ].join(" ")}
                    >
                      {m.content}
                    </div>
                  ))}
                  {isLoading && (
                    <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
                      <span className={styles.typing}>
                        <span className={styles.typingDot} />
                        <span className={styles.typingDot} />
                        <span className={styles.typingDot} />
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            <form className={styles.composer} onSubmit={handleSubmit}>
              <textarea
                className={styles.textarea}
                placeholder={configured ? "Pergunte algo..." : "Configure VITE_OPENAI_API_KEY ou a Edge Function ai-chat"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={!configured || isLoading}
              />
              <button
                type="submit"
                className={styles.sendBtn}
                disabled={!configured || isLoading || !input.trim()}
                aria-label="Enviar"
              >
                <SendIcon />
              </button>
            </form>
          </div>
        </>
      )}
    </>
  )
}

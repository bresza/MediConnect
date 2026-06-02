import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ChatMessage } from "../../../services/ai"
import {
  AI_STARTERS_BY_ROLE,
  AIError, buildSystemPrompt, chatComplete, getAIMode, getAIModel, isAIConfigured,
} from "../../../services/ai"
import { runAIAgentTurn } from "../../../services/aiAgent"
import type { AppAIActions } from "../../../services/aiActions"
import { useSpeechRecognition } from "../../../hooks/useSpeechRecognition"
import { useSpeechSynthesis } from "../../../hooks/useSpeechSynthesis"
import type { User, UserRole } from "../../../types"
import styles from "./AIAssistant.module.css"

interface AIAssistantProps {
  currentUser: User
  clinicName?: string | null
  apiContextSnapshot?: string
  /** Quando presente, o assistente executa acoes reais no sistema (modo agente). */
  appActions?: AppAIActions
}

const ROLE_LABEL: Record<UserRole, string> = {
  doctor:    "Modo médico",
  manager:   "Modo gestão",
  financial: "Modo financeiro",
  secretary: "Modo secretaria",
  admin:     "Modo administrador",
  patient:   "Modo paciente",
}

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
const MicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
    <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
  </svg>
)

interface UiMessage extends ChatMessage {
  id:    string
  error?: boolean
}

interface PendingAction {
  action: string
  params: Record<string, unknown>
  summary: string
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const HISTORY_VERSION = "v5-agent"

function historyKey(userId: string): string {
  return `mediconnect:ai-history:${HISTORY_VERSION}:${userId}`
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
  } catch { /* ignore */ }
}

export function AIAssistant({ currentUser, clinicName, apiContextSnapshot, appActions }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<UiMessage[]>(() => loadHistory(currentUser.id))
  const [isLoading, setIsLoading] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const handleSendRef = useRef<(text: string, confirmed?: PendingAction) => Promise<void>>(async () => {})

  const role = currentUser.role
  const configured = isAIConfigured()
  const mode = getAIMode()
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

  const starters = AI_STARTERS_BY_ROLE[role] ?? AI_STARTERS_BY_ROLE.secretary
  const { supported: ttsSupported, speak, stop: stopSpeak } = useSpeechSynthesis({ lang: "pt-BR" })

  const speakReply = useCallback(
    (text: string) => {
      if (!ttsSupported || !text.trim()) return
      const plain = text.replace(/\n+/g, ". ").replace(/\s+/g, " ").trim()
      speak(plain.slice(0, 4000))
    },
    [ttsSupported, speak],
  )

  useEffect(() => { setMessages(loadHistory(currentUser.id)) }, [currentUser.id, mode])
  useEffect(() => { saveHistory(currentUser.id, messages) }, [messages, currentUser.id])
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages, isOpen, pendingAction])
  useEffect(() => () => abortRef.current?.abort(), [])

  const handleSend = useCallback(async (rawText: string, confirmed?: PendingAction) => {
    const text = rawText.trim()
    if (!text && !confirmed) return
    if (!configured || isLoading) return

    const userMsg: UiMessage | null = text
      ? { id: newId(), role: "user", content: text }
      : null
    const nextMessages = userMsg ? [...messages, userMsg] : messages
    if (userMsg) setMessages(nextMessages)
    setInput("")
    setIsLoading(true)
    setPendingAction(null)

    const controller = new AbortController()
    abortRef.current = controller

    const conversation: ChatMessage[] = nextMessages.map(({ role: r, content }) => ({ role: r, content }))

    try {
      let reply: string

      if (appActions) {
        const result = await runAIAgentTurn(systemPrompt, conversation, appActions, {
          signal: controller.signal,
          confirmedAction: confirmed,
        })
        reply = result.reply
        if (result.pendingConfirmation) {
          setPendingAction(result.pendingConfirmation)
        }
      } else {
        const payload: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...conversation]
        reply = await chatComplete(payload, { signal: controller.signal })
      }

      setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: reply }])
      speakReply(reply)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      const message = err instanceof AIError ? err.message
        : err instanceof Error ? err.message
        : "Erro inesperado ao consultar o assistente."
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: message, error: true }])
      speakReply(message)
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [messages, isLoading, configured, systemPrompt, appActions, speakReply])

  handleSendRef.current = handleSend

  const { supported: voiceSupported, listening: voiceListening, toggle: toggleVoice, abort: abortVoice } = useSpeechRecognition({
    lang: "pt-BR",
    autoSendOnEnd: true,
    onInterimTranscript: (t) => {
      setVoiceError(null)
      setInput(t)
      stopSpeak()
    },
    onFinalTranscript: (t) => {
      setInput("")
      void handleSendRef.current(t)
    },
    onError: (message) => setVoiceError(message),
  })

  useEffect(() => {
    if (!isOpen) {
      abortVoice()
      stopSpeak()
    }
  }, [isOpen, abortVoice, stopSpeak])

  function handleClear() {
    abortRef.current?.abort()
    stopSpeak()
    setMessages([])
    setPendingAction(null)
    try { localStorage.removeItem(historyKey(currentUser.id)) } catch { /* ignore */ }
  }

  async function handleConfirmAction() {
    if (!pendingAction) return
    const p = pendingAction
    setPendingAction(null)
    await handleSend("", p)
  }

  return (
    <>
      {!isOpen && (
        <button className={styles.fab} onClick={() => setIsOpen(true)} aria-label="Abrir MediConnect Assistente" type="button">
          <span className={styles.fabPulse} aria-hidden />
          <SparkIcon />
        </button>
      )}

      {isOpen && (
        <>
          <div className={styles.backdrop} onClick={() => setIsOpen(false)} aria-hidden />
          <div className={styles.panel} role="dialog" aria-label="MediConnect Assistente">
            <div className={styles.header}>
              <div className={styles.headerIcon}><SparkIcon size={18} /></div>
              <div className={styles.headerText}>
                <p className={styles.headerTitle}>MediConnect Assistente</p>
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
                Configure <code>VITE_GROQ_API_KEY</code> ou <code>VITE_GEMINI_API_KEY</code> no .env para usar o assistente com ações automáticas.
              </div>
            )}

            {pendingAction && (
              <div className={styles.confirmCard}>
                <p className={styles.confirmTitle}>Confirmar ação</p>
                <p className={styles.confirmText}>{pendingAction.summary}</p>
                <div className={styles.confirmActions}>
                  <button type="button" className={styles.confirmCancel} onClick={() => setPendingAction(null)}>
                    Cancelar
                  </button>
                  <button type="button" className={styles.confirmOk} onClick={() => void handleConfirmAction()} disabled={isLoading}>
                    Confirmar
                  </button>
                </div>
              </div>
            )}

            <div className={styles.messages} ref={listRef}>
              {messages.length === 0 ? (
                <div className={styles.empty}>
                  <strong>O que deseja fazer?</strong>
                  <span>Fale ou escolha uma ação — a IA executa no MediConnect.</span>
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
                        m.role === "user" ? styles.bubbleUser
                          : m.error ? `${styles.bubbleAssistant} ${styles.bubbleError}` : styles.bubbleAssistant,
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

            <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); void handleSend(input) }}>
              <div className={styles.composerField}>
                <textarea
                  className={styles.textarea}
                  placeholder={configured
                    ? (voiceListening ? "Ouvindo… fale o comando" : "Ex.: agende consulta para Maria amanhã às 14h")
                    : "Configure a chave de IA no .env"}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(input) }
                  }}
                  rows={1}
                  disabled={!configured || isLoading || voiceListening}
                />
                {voiceListening && (
                  <span className={styles.listeningBadge} aria-live="polite">
                    <span className={styles.listeningDot} /> Gravando voz
                  </span>
                )}
                {voiceError && !voiceListening && (
                  <span className={styles.voiceError} role="alert">{voiceError}</span>
                )}
              </div>
              <button
                type="button"
                className={`${styles.micBtn} ${voiceListening ? styles.micBtnActive : ""}`}
                disabled={!configured || isLoading || !voiceSupported}
                onClick={() => { setVoiceError(null); toggleVoice() }}
                aria-label="Comando por voz"
              >
                <MicIcon />
              </button>
              <button type="submit" className={styles.sendBtn} disabled={!configured || isLoading || !input.trim() || voiceListening}>
                <SendIcon />
              </button>
            </form>
          </div>
        </>
      )}
    </>
  )
}

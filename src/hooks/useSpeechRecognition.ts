import { useCallback, useEffect, useRef, useState } from "react"

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: { transcript: string }
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultLike[]
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string
  readonly message?: string
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface UseSpeechRecognitionOptions {
  lang?: string
  /** Mantém escuta ativa entre pausas naturais da fala (reinicia após onend). */
  continuous?: boolean
  /** Envia automaticamente ao encerrar a captura (pausa ou clique no mic). */
  autoSendOnEnd?: boolean
  /** Cada trecho finalizado enquanto grava (ideal para dictado contínuo). */
  onFinalChunk?: (text: string) => void
  onFinalTranscript?: (text: string) => void
  onInterimTranscript?: (text: string) => void
  onError?: (message: string) => void
}

export function useSpeechRecognition({
  lang = "pt-BR",
  continuous = false,
  autoSendOnEnd = true,
  onFinalChunk,
  onFinalTranscript,
  onInterimTranscript,
  onError,
}: UseSpeechRecognitionOptions = {}) {
  const Ctor = getSpeechRecognitionCtor()
  const supported = Boolean(Ctor)

  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const finalPartsRef = useRef<string[]>([])
  const shouldSendRef = useRef(false)
  const keepListeningRef = useRef(false)

  const onFinalChunkRef = useRef(onFinalChunk)
  const onFinalTranscriptRef = useRef(onFinalTranscript)
  const onInterimTranscriptRef = useRef(onInterimTranscript)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onFinalChunkRef.current = onFinalChunk
    onFinalTranscriptRef.current = onFinalTranscript
    onInterimTranscriptRef.current = onInterimTranscript
    onErrorRef.current = onError
  }, [onFinalChunk, onFinalTranscript, onInterimTranscript, onError])

  const stop = useCallback(() => {
    keepListeningRef.current = false
    shouldSendRef.current = autoSendOnEnd
    recognitionRef.current?.stop()
  }, [autoSendOnEnd])

  const abort = useCallback(() => {
    keepListeningRef.current = false
    shouldSendRef.current = false
    finalPartsRef.current = []
    recognitionRef.current?.abort()
    setListening(false)
  }, [])

  const startRecognition = useCallback(() => {
    if (!Ctor) return

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => setListening(true)

    recognition.onresult = (event) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ""
        if (result.isFinal) {
          const chunk = text.trim()
          if (chunk) {
            finalPartsRef.current.push(chunk)
            onFinalChunkRef.current?.(chunk)
          }
        } else {
          interim += text
        }
      }
      const finals = finalPartsRef.current.join(" ").replace(/\s+/g, " ").trim()
      const preview = [finals, interim.trim()].filter(Boolean).join(" ").trim()
      onInterimTranscriptRef.current?.(preview)
    }

    recognition.onerror = (event) => {
      if (event.error === "aborted") return
      const message = event.error === "not-allowed"
        ? "Permissão do microfone negada. Libere o acesso nas configurações do navegador."
        : event.error === "no-speech"
          ? "Nenhuma fala detectada. Tente novamente."
          : "Não foi possível capturar a voz."
      onErrorRef.current?.(message)
      keepListeningRef.current = false
      shouldSendRef.current = false
      setListening(false)
    }

    recognition.onend = () => {
      if (keepListeningRef.current && continuous) {
        try {
          recognition.start()
          return
        } catch {
          keepListeningRef.current = false
        }
      }

      setListening(false)
      const text = finalPartsRef.current.join(" ").replace(/\s+/g, " ").trim()
      finalPartsRef.current = []
      if (shouldSendRef.current && text) onFinalTranscriptRef.current?.(text)
      shouldSendRef.current = false
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      onErrorRef.current?.("Não foi possível iniciar o microfone.")
      keepListeningRef.current = false
      setListening(false)
    }
  }, [Ctor, lang, continuous])

  const start = useCallback(() => {
    if (!Ctor || listening) return
    finalPartsRef.current = []
    shouldSendRef.current = autoSendOnEnd
    keepListeningRef.current = true
    startRecognition()
  }, [Ctor, listening, autoSendOnEnd, startRecognition])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  useEffect(() => () => {
    keepListeningRef.current = false
    shouldSendRef.current = false
    recognitionRef.current?.abort()
  }, [])

  return { supported, listening, start, stop, toggle, abort }
}

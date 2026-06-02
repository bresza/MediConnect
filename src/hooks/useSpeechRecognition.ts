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
  /** Envia automaticamente ao encerrar a captura (pausa ou clique no mic). */
  autoSendOnEnd?: boolean
  onFinalTranscript?: (text: string) => void
  onInterimTranscript?: (text: string) => void
  onError?: (message: string) => void
}

export function useSpeechRecognition({
  lang = "pt-BR",
  autoSendOnEnd = true,
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

  const stop = useCallback(() => {
    shouldSendRef.current = autoSendOnEnd
    recognitionRef.current?.stop()
  }, [autoSendOnEnd])

  const abort = useCallback(() => {
    shouldSendRef.current = false
    finalPartsRef.current = []
    recognitionRef.current?.abort()
    setListening(false)
  }, [])

  const start = useCallback(() => {
    if (!Ctor || listening) return

    finalPartsRef.current = []
    shouldSendRef.current = autoSendOnEnd

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => setListening(true)

    recognition.onresult = (event) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ""
        if (result.isFinal) finalPartsRef.current.push(text)
        else interim += text
      }
      const finals = finalPartsRef.current.join(" ").replace(/\s+/g, " ").trim()
      const preview = [finals, interim.trim()].filter(Boolean).join(" ").trim()
      if (preview) onInterimTranscript?.(preview)
    }

    recognition.onerror = (event) => {
      if (event.error === "aborted") return
      const message = event.error === "not-allowed"
        ? "Permissão do microfone negada. Libere o acesso nas configurações do navegador."
        : event.error === "no-speech"
          ? "Nenhuma fala detectada. Tente novamente."
          : "Não foi possível capturar a voz."
      onError?.(message)
      shouldSendRef.current = false
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
      const text = finalPartsRef.current.join(" ").replace(/\s+/g, " ").trim()
      finalPartsRef.current = []
      if (shouldSendRef.current && text) onFinalTranscript?.(text)
      shouldSendRef.current = false
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      onError?.("Não foi possível iniciar o microfone.")
      setListening(false)
    }
  }, [Ctor, listening, lang, autoSendOnEnd, onFinalTranscript, onInterimTranscript, onError])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  useEffect(() => () => {
    shouldSendRef.current = false
    recognitionRef.current?.abort()
  }, [])

  return { supported, listening, start, stop, toggle, abort }
}

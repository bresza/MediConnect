import { useCallback, useEffect, useRef, useState } from "react"

interface Options {
  lang?: string
  rate?: number
}

export function useSpeechSynthesis({ lang = "pt-BR", rate = 1 }: Options = {}) {
  const [speaking, setSpeaking] = useState(false)
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)

  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return
      stop()
      const utter = new SpeechSynthesisUtterance(text.trim())
      utter.lang = lang
      utter.rate = rate
      utter.onend = () => setSpeaking(false)
      utter.onerror = () => setSpeaking(false)
      utterRef.current = utter
      setSpeaking(true)
      window.speechSynthesis.speak(utter)
    },
    [supported, lang, rate, stop],
  )

  useEffect(() => () => stop(), [stop])

  return { supported, speaking, speak, stop }
}

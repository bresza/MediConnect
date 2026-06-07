import { useCallback, useEffect, useRef, useState } from "react"
import type { Toast, ToastVariant } from "../types"

const DEFAULT_TOAST_DURATION_MS = 4000
const ERROR_TOAST_DURATION_MS = 8000

export interface UseToastReturn {
  toasts: Toast[]
  toast: (message: string, variant?: ToastVariant, durationMs?: number) => void
  dismiss: (id: string) => void
}

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, number>>(new Map())

  const dismiss = useCallback((id: string) => {
    const timerId = timersRef.current.get(id)
    if (timerId !== undefined) {
      window.clearTimeout(timerId)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((
    message: string,
    variant: ToastVariant = "success",
    durationMs = variant === "error" ? ERROR_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS,
  ) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, message, variant }])
    const timerId = window.setTimeout(() => {
      timersRef.current.delete(id)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, durationMs)
    timersRef.current.set(id, timerId)
  }, [])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId))
      timers.clear()
    }
  }, [])

  return { toasts, toast, dismiss }
}

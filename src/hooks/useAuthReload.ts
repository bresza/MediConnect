import { useEffect } from "react"
import { useAuth } from "../contexts/authStore"

/**
 * Dispara `load` quando há sessão autenticada e limpa com `onClear` ao sair.
 * `enabled: false` evita fetch de staff quando o perfil é paciente.
 */
export function useAuthReload(
  load: () => Promise<void>,
  onClear?: () => void,
  options?: { enabled?: boolean },
): void {
  const { user, token } = useAuth()
  const enabled = options?.enabled ?? true

  useEffect(() => {
    if (!enabled || !user?.id || !token) {
      onClear?.()
      return
    }
    void load()
  }, [enabled, user?.id, token, load, onClear])
}

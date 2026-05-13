import { useCallback, useEffect, useMemo, useState } from "react"
import type { WaitlistEntry } from "../types"
import {
  createWaitlistEntry, getWaitlist, removeWaitlistEntry, sortWaitlist, updateWaitlistEntry,
  type InferPriorityResult,
} from "../services/waitlist"

interface CreateInput extends Omit<WaitlistEntry, "id" | "enteredAt" | "dueBy" | "priorityColor" | "status"> {
  inferred: InferPriorityResult
}

export interface UseWaitlistResult {
  entries: WaitlistEntry[]
  sorted:  WaitlistEntry[]
  loading: boolean
  error:   string | null
  reload:  () => Promise<void>
  add:     (input: CreateInput) => Promise<WaitlistEntry>
  update:  (entry: WaitlistEntry) => Promise<WaitlistEntry>
  remove:  (id: string) => Promise<void>
}

export function useWaitlist(): UseWaitlistResult {
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getWaitlist()
      setEntries(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar a fila.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const add = useCallback(async (input: CreateInput) => {
    const created = await createWaitlistEntry(input)
    setEntries((prev) => [...prev, created])
    return created
  }, [])

  const update = useCallback(async (entry: WaitlistEntry) => {
    const next = await updateWaitlistEntry(entry)
    setEntries((prev) => prev.map((e) => e.id === entry.id ? next : e))
    return next
  }, [])

  const remove = useCallback(async (id: string) => {
    await removeWaitlistEntry(id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const sorted = useMemo(() => sortWaitlist(entries), [entries])

  return { entries, sorted, loading, error, reload, add, update, remove }
}

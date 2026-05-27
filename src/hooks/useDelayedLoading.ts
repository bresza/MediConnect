import { useEffect, useState } from "react"

/** Returns true only after `isLoading` stays true for `delayMs` (default 300). */
export function useDelayedLoading(isLoading: boolean, delayMs = 300): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!isLoading) return
    const id = window.setTimeout(() => setShow(true), delayMs)
    return () => {
      window.clearTimeout(id)
      setShow(false)
    }
  }, [isLoading, delayMs])

  if (!isLoading) return false
  return show
}

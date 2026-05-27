import type { AppointmentRange } from "./queryKeys"

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Default window: 30 days back → 90 days forward (inclusive dates as YYYY-MM-DD). */
export function getDefaultAppointmentRange(): AppointmentRange {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - 30)
  const to = new Date(now)
  to.setDate(to.getDate() + 90)
  return { from: toDateKey(from), to: toDateKey(to) }
}

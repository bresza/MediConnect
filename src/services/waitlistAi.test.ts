import { describe, expect, it } from "vitest"
import {
  buildRuleBasedSuggestions,
  parseAiRankResponse,
  type FreedSlotContext,
} from "./waitlistAi"
import type { WaitlistEntry } from "../types"
import {
  buildAppointmentAbsentSms,
  buildAppointmentCancelledSms,
  buildAppointmentRescheduledSms,
} from "./appointmentNotifications"

const freed: FreedSlotContext = {
  id:         "appt-1",
  doctorId:   "doc-1",
  doctorName: "Dr. Silva",
  date:       "2026-06-01",
  time:       "14:00",
  duration:   30,
  type:       "consultation",
  patientId:  "pat-old",
}

function makeEntry(overrides: Partial<WaitlistEntry> & Pick<WaitlistEntry, "id" | "priorityColor">): WaitlistEntry {
  return {
    patientId:     "p1",
    patientName:   "Maria Santos",
    flags:         {},
    enteredAt:     "2026-01-01T10:00:00.000Z",
    dueBy:         "2026-03-01",
    status:        "waiting",
    ...overrides,
  }
}

describe("waitlistAi", () => {
  it("buildRuleBasedSuggestions orders by SUS priority", () => {
    const entries = [
      makeEntry({ id: "wl-green", priorityColor: "green" }),
      makeEntry({ id: "wl-red", priorityColor: "red", patientId: "p2", patientName: "João" }),
      makeEntry({ id: "wl-yellow", priorityColor: "yellow", patientId: "p3", patientName: "Ana" }),
    ]
    const result = buildRuleBasedSuggestions(freed, entries, 3)
    expect(result[0].entry.id).toBe("wl-red")
    expect(result[0].usedAi).toBe(false)
    expect(result[0].rationale).toContain("Vermelho")
  })

  it("excludes freed patient from candidates", () => {
    const entries = [
      makeEntry({ id: "wl-same", priorityColor: "red", patientId: "pat-old" }),
      makeEntry({ id: "wl-other", priorityColor: "yellow", patientId: "p9", patientName: "Outro" }),
    ]
    const result = buildRuleBasedSuggestions(freed, entries, 3)
    expect(result).toHaveLength(1)
    expect(result[0].entry.id).toBe("wl-other")
  })

  it("parseAiRankResponse extracts valid ranked items", () => {
    const ids = new Set(["a", "b"])
    const raw = 'Texto extra {"ranked":[{"waitlistEntryId":"a","rank":1,"rationale":"Urgência clínica","score":90}]}'
    const parsed = parseAiRankResponse(raw, ids)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].waitlistEntryId).toBe("a")
    expect(parsed[0].rationale).toBe("Urgência clínica")
  })

  it("parseAiRankResponse ignores unknown ids", () => {
    const parsed = parseAiRankResponse(
      '{"ranked":[{"waitlistEntryId":"unknown","rank":1,"rationale":"x"}]}',
      new Set(["a"]),
    )
    expect(parsed).toHaveLength(0)
  })
})

describe("appointmentNotifications", () => {
  it("buildAppointmentCancelledSms includes slot and doctor", () => {
    const sms = buildAppointmentCancelledSms("Maria Silva", "Dr. Silva", "2026-06-01", "14:00", "consultation")
    expect(sms).toContain("Maria")
    expect(sms).toContain("Dr. Silva")
    expect(sms).toContain("cancelada")
  })

  it("buildAppointmentRescheduledSms mentions old and new slots", () => {
    const sms = buildAppointmentRescheduledSms(
      "Maria Silva",
      "Dr. Silva",
      "2026-06-01",
      "14:00",
      "2026-06-02",
      "10:00",
    )
    expect(sms).toContain("remarcada")
    expect(sms).toContain("10:00")
  })

  it("buildAppointmentAbsentSms mentions absence", () => {
    const sms = buildAppointmentAbsentSms("Maria Silva", "Dr. Silva", "2026-06-01", "14:00")
    expect(sms).toContain("ausência")
  })
})

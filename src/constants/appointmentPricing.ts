import type { AppointmentType } from "../types"
import { formatAppointmentType } from "../utils"

/** Valores default por tipo de agendamento (configurável em Settings futuramente). */
export const APPOINTMENT_TYPE_PRICES: Record<AppointmentType, number> = {
  consultation: 250,
  exam:         180,
  return:       120,
  procedure:    350,
}

export function getAppointmentPrice(type: AppointmentType | string): number {
  return APPOINTMENT_TYPE_PRICES[type as AppointmentType] ?? APPOINTMENT_TYPE_PRICES.consultation
}

export function formatAppointmentPriceLabel(type: AppointmentType | string): string {
  const label = formatAppointmentType(type)
  const price = getAppointmentPrice(type)
  return `${label} — R$ ${price.toFixed(2)}`
}

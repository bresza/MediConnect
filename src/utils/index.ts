export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-BR")
}

const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  consultation: "Consulta",
  exam:         "Exame",
  return:       "Retorno",
  procedure:    "Procedimento",
}

export function formatAppointmentType(type: string): string {
  return APPOINTMENT_TYPE_LABELS[type] ?? type
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  Cash:      "Dinheiro",
  Card:      "Cartão",
  Pix:       "Pix",
  Insurance: "Convênio",
  Transfer:  "Transferência",
}

export function formatPaymentMethod(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method
}

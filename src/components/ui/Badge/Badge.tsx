import styles from "./Badge.module.css"

const STATUS_MAP: Record<string, string> = {
  confirmed:  styles.confirmed,
  completed:  styles.completed,
  scheduled:  styles.scheduled,
  requested:  styles.pending,
  Active:     styles.active,
  Finalized:  styles.finalized,
  finalized:  styles.finalized,
  open:       styles.open,
  Delivered:  styles.delivered,
  delivered:  styles.delivered,
  Paid:       styles.paid,
  WhatsApp:   styles.whatsapp,
  pending:    styles.pending,
  Draft:      styles.draft,
  draft:      styles.draft,
  Pending:    styles.pending,
  absent:     styles.absent,
  cancelled:  styles.cancelled,
  Failed:     styles.failed,
  Overdue:    styles.overdue,
  Cancelled:  styles.cancelled,
  Sent:       styles.sent,
  Email:      styles.email,
  SMS:        styles.sms,
  Inactive:   styles.inactive,
  blocked:    styles.blocked,
  waiting:    styles.pending,
  removed:    styles.inactive,
  emitted:    styles.confirmed,
}

export const STATUS_LABELS: Record<string, string> = {
  confirmed:  "Confirmado",
  completed:  "Concluído",
  scheduled:  "Agendado",
  requested:  "Solicitado",
  pending:    "Pendente",
  absent:     "Ausente",
  blocked:    "Bloqueado",
  cancelled:  "Cancelado",
  Active:     "Ativo",
  Inactive:   "Inativo",
  Finalized:  "Finalizado",
  finalized:  "Finalizado",
  open:       "Aberto",
  Draft:      "Rascunho",
  draft:      "Rascunho",
  Sent:       "Enviado",
  Delivered:  "Entregue",
  delivered:  "Entregue",
  Failed:     "Falhou",
  Pending:    "Pendente",
  Paid:       "Pago",
  Overdue:    "Atrasado",
  Cancelled:  "Cancelado",
  waiting:    "Aguardando",
  removed:    "Removido",
  emitted:    "Emitida",
  WhatsApp:   "WhatsApp",
  Email:      "E-mail",
  SMS:        "SMS",
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? STATUS_LABELS[status.toLowerCase()] ?? status
}

interface BadgeProps { children: string }

export function Badge({ children }: BadgeProps) {
  const colorClass = STATUS_MAP[children] ?? STATUS_MAP[children.toLowerCase()] ?? styles.fallback
  const label = getStatusLabel(children)
  return (
    <span className={`${styles.badge} ${colorClass}`}>
      {label}
    </span>
  )
}

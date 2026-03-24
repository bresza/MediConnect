import styles from "./Badge.module.css"

const STATUS_MAP: Record<string, string> = {
  confirmed:  styles.confirmed,
  completed:  styles.completed,
  scheduled:  styles.scheduled,
  Active:     styles.active,
  Finalized:  styles.finalized,
  finalized:  styles.finalized,
  open:       styles.open,
  Delivered:  styles.delivered,
  Paid:       styles.paid,
  WhatsApp:   styles.whatsapp,
  pending:    styles.pending,
  Draft:      styles.draft,
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
}

const LABELS: Record<string, string> = {
  confirmed:  "Confirmado",
  completed:  "Concluído",
  scheduled:  "Agendado",
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
  Sent:       "Enviado",
  Delivered:  "Entregue",
  Failed:     "Falhou",
  Pending:    "Pendente",
  Paid:       "Pago",
  Overdue:    "Atrasado",
  Cancelled:  "Cancelado",
}

interface BadgeProps { children: string }

export function Badge({ children }: BadgeProps) {
  const colorClass = STATUS_MAP[children] ?? styles.fallback
  const label = LABELS[children] ?? children
  return (
    <span className={`${styles.badge} ${colorClass}`}>
      {label}
    </span>
  )
}

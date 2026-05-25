import { Badge } from "../../components/ui/Badge/Badge"
import { Button } from "../../components/ui/Button/Button"
import type { FinancialRecord, PaymentStatus } from "../../types"
import { formatDate } from "../../utils"
import styles from "./PatientBillingView.module.css"

interface PatientBillingViewProps {
  records: FinancialRecord[]
  loading?: boolean
}

const STATUS_LABEL: Record<PaymentStatus, string> = {
  Paid: "Pago",
  Pending: "Pendente",
  Overdue: "Vencido",
  Cancelled: "Cancelado",
}

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function openBoleto(record: FinancialRecord) {
  if (record.boletoUrl) {
    window.open(record.boletoUrl, "_blank", "noopener,noreferrer")
    return
  }

  const lines = [
    "BOLETO / COBRANÇA — MediConnect",
    "",
    `Paciente: ${record.patientName}`,
    `Valor: ${formatMoney(record.value)}`,
    record.discount ? `Desconto: ${formatMoney(record.discount)}` : "",
    `Vencimento: ${formatDate(record.dueDate)}`,
    `Forma de pagamento: ${record.paymentMethod}`,
    record.healthInsurance ? `Convênio: ${record.healthInsurance}` : "",
    record.observations ? `Observações: ${record.observations}` : "",
    "",
    "Apresente este comprovante na recepção ou entre em contato com a secretaria.",
  ].filter(Boolean)

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `boleto-${record.id}.txt`
  link.click()
  URL.revokeObjectURL(url)
}

export function PatientBillingView({ records, loading }: PatientBillingViewProps) {
  const pending = records.filter((record) => record.status === "Pending" || record.status === "Overdue")
  const paid = records.filter((record) => record.status === "Paid")

  if (loading) {
    return <p className={styles.hint}>Carregando cobranças...</p>
  }

  if (records.length === 0) {
    return (
      <div className={styles.empty}>
        <strong>Nenhuma cobrança encontrada</strong>
        <span>Quando a clínica gerar um boleto ou cobrança, ele aparecerá aqui.</span>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {pending.length > 0 && (
        <section className={styles.group}>
          <h3>Pendentes</h3>
          <ul className={styles.list}>
            {pending.map((record) => (
              <li key={record.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <p>{formatMoney(record.value)}</p>
                  <span>Vencimento: {formatDate(record.dueDate)} • {record.paymentMethod}</span>
                  {record.observations && <small>{record.observations}</small>}
                </div>
                <div className={styles.itemActions}>
                  <Badge>{STATUS_LABEL[record.status]}</Badge>
                  <Button size="sm" onClick={() => openBoleto(record)}>
                    {record.boletoUrl ? "Abrir boleto" : "Baixar boleto"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {paid.length > 0 && (
        <section className={styles.group}>
          <h3>Pagos</h3>
          <ul className={styles.list}>
            {paid.map((record) => (
              <li key={record.id} className={`${styles.item} ${styles.itemMuted}`}>
                <div className={styles.itemMain}>
                  <p>{formatMoney(record.value)}</p>
                  <span>Pago • {formatDate(record.dueDate)}</span>
                </div>
                <Badge>{STATUS_LABEL[record.status]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

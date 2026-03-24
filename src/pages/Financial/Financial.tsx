import { FINANCIAL_RECORDS } from "../../data/mock"
import { Topbar } from "../../components/layout/Topbar/Topbar"
import { Card } from "../../components/ui/Card/Card"
import { Badge } from "../../components/ui/Badge/Badge"
import { Avatar } from "../../components/ui/Avatar/Avatar"
import { Button } from "../../components/ui/Button/Button"
import { formatDate, formatPaymentMethod } from "../../utils"
import styles from "./Financial.module.css"

export function Financial() {
  const total   = FINANCIAL_RECORDS.reduce((sum, r) => sum + r.value, 0)
  const paid    = FINANCIAL_RECORDS.filter((r) => r.status === "Paid").reduce((sum, r) => sum + r.value, 0)
  const pending = FINANCIAL_RECORDS.filter((r) => r.status === "Pending").reduce((sum, r) => sum + r.value, 0)
  const overdue = FINANCIAL_RECORDS.filter((r) => r.status === "Overdue").reduce((sum, r) => sum + r.value, 0)

  const stats = [
    { label: "Total previsto", value: `R$ ${total.toFixed(2)}`,   cls: styles.statDefault },
    { label: "Recebido",       value: `R$ ${paid.toFixed(2)}`,    cls: styles.statGreen   },
    { label: "Pendente",       value: `R$ ${pending.toFixed(2)}`, cls: styles.statAmber   },
    { label: "Em atraso",      value: `R$ ${overdue.toFixed(2)}`, cls: styles.statRed     },
  ]

  return (
    <div>
      <Topbar
        title="Financeiro"
        subtitle="Receitas e cobranças do período"
        action={<Button>Novo lançamento</Button>}
      />

      <div className={styles.statsGrid}>
        {stats.map((s) => (
          <Card key={s.label} className={styles.statCard}>
            <p className={styles.statLabel}>{s.label}</p>
            <p className={`${styles.statValue} ${s.cls}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                {["Paciente", "Valor", "Método", "Convênio", "Vencimento", "Status", "Ações"].map((h) => (
                  <th key={h} className={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FINANCIAL_RECORDS.map((r, i) => {
                const isLast = i === FINANCIAL_RECORDS.length - 1
                return (
                  <tr key={r.id}>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                      <div className={styles.patientCell}>
                        <Avatar name={r.patientName} size="sm" />
                        <span className={styles.patientName}>{r.patientName}</span>
                      </div>
                    </td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                      <span className={styles.valueCell}>
                        R$ {(r.value - (r.discount ?? 0)).toFixed(2)}
                      </span>
                      {r.discount && <span className={styles.discount}>(-{r.discount})</span>}
                    </td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{formatPaymentMethod(r.paymentMethod)}</td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{r.healthInsurance ?? "—"}</td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>{formatDate(r.dueDate)}</td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}><Badge>{r.status}</Badge></td>
                    <td className={`${styles.td} ${isLast ? styles.tdLast : ""}`}>
                      <Button size="sm" variant="ghost">Receber</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

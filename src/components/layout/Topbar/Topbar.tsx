import type { ReactNode } from "react"
import styles from "./Topbar.module.css"

interface TopbarProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function Topbar({ title, subtitle, action }: TopbarProps) {
  return (
    <div className={styles.topbar}>
      <div className={styles.info}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div className={styles.actions}>{action}</div>}
    </div>
  )
}

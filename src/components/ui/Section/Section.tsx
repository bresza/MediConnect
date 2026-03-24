import type { ReactNode } from "react"
import styles from "./Section.module.css"

interface SectionProps {
  title: string
  children: ReactNode
}

export function Section({ title, children }: SectionProps) {
  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <div className={styles.divider} />
      </div>
      {children}
    </div>
  )
}

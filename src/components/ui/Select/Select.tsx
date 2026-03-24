import type { ChangeEvent } from "react"
import styles from "./Select.module.css"

interface SelectProps {
  label?: string
  options: string[]
  value?: string
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void
  required?: boolean
  placeholder?: string
  className?: string
}

export function Select({
  label,
  options,
  value,
  onChange,
  required,
  placeholder = "Selecione",
  className = "",
}: SelectProps) {
  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      <select value={value} onChange={onChange} className={styles.select}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  )
}

import type { ChangeEvent } from "react"
import styles from "./Select.module.css"

interface SelectProps {
  label?:       string
  id?:          string
  name?:        string
  options:      string[] | { value: string; label: string }[]
  value?:       string
  onChange?:    (e: ChangeEvent<HTMLSelectElement>) => void
  required?:    boolean
  disabled?:    boolean
  error?:       string
  hint?:        string
  placeholder?: string
  className?:   string
}

export function Select({
  label,
  id,
  name,
  options,
  value,
  onChange,
  required,
  disabled,
  error,
  hint,
  placeholder = "Selecione",
  className   = "",
}: SelectProps) {
  const inputId = id ?? name

  // Normaliza options para sempre { value, label }
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  )

  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label htmlFor={inputId} className={styles.label} translate="no">
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      <div className={styles.selectWrapper}>
        <select
          id={inputId}
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          className={`${styles.select} ${error ? styles.selectError : ""} ${disabled ? styles.selectDisabled : ""}`}
        >
          <option value="">{placeholder}</option>
          {normalized.map((o, index) => (
            <option key={`${o.value}-${o.label}-${index}`} value={o.value}>{o.label}</option>
          ))}
        </select>
        <svg className={styles.chevron} width="14" height="14" fill="none"
          stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {hint  && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.errorMsg}>{error}</span>}
    </div>
  )
}

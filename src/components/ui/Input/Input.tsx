import type { ChangeEvent, FocusEvent, ReactNode } from "react"
import styles from "./Input.module.css"

interface InputProps {
  label?:        string
  id?:           string
  name?:         string
  type?:         string
  placeholder?:  string
  value?:        string
  onChange?:     (e: ChangeEvent<HTMLInputElement>) => void
  onBlur?:       (e: FocusEvent<HTMLInputElement>) => void
  required?:     boolean
  disabled?:     boolean
  error?:        string
  hint?:         string
  className?:    string
  children?:     ReactNode
  defaultValue?: string
  autoComplete?: string
  min?:          string
  max?:          string
  maxLength?:    number
  inputMode?:    "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search"
  pattern?:      string
  readOnly?:     boolean
}

export function Input({
  label, id, name, type = "text", placeholder, value, onChange, onBlur,
  required, disabled, error, hint, className = "", children,
  defaultValue, autoComplete, min, max, maxLength, inputMode, pattern, readOnly,
}: InputProps) {
  const inputId = id ?? name
  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}{required && <span className={styles.required}>*</span>}
        </label>
      )}
      {children ?? (
        <input
          id={inputId} name={name} type={type} placeholder={placeholder}
          value={value} defaultValue={defaultValue} onChange={onChange} onBlur={onBlur}
          required={required} disabled={disabled} readOnly={readOnly}
          autoComplete={autoComplete} min={min} max={max} maxLength={maxLength}
          inputMode={inputMode} pattern={pattern}
          className={`${styles.input} ${error ? styles.inputError : ""} ${disabled ? styles.inputDisabled : ""}`}
        />
      )}
      {hint  && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.errorMsg}>{error}</span>}
    </div>
  )
}

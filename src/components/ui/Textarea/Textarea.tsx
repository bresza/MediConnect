import type { ChangeEvent } from "react"
import styles from "./Textarea.module.css"

interface TextareaProps {
  label?:       string
  id?:          string
  name?:        string
  placeholder?: string
  value?:       string
  onChange?:    (e: ChangeEvent<HTMLTextAreaElement>) => void
  required?:    boolean
  disabled?:    boolean
  error?:       string
  hint?:        string
  rows?:        number
  className?:   string
  readOnly?:    boolean
}

export function Textarea({
  label,
  id,
  name,
  placeholder,
  value,
  onChange,
  required,
  disabled,
  error,
  hint,
  rows      = 4,
  className = "",
  readOnly,
}: TextareaProps) {
  const inputId = id ?? name

  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        rows={rows}
        className={`${styles.textarea} ${error ? styles.error : ""} ${disabled ? styles.disabled : ""}`}
      />
      {hint  && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.errorMsg}>{error}</span>}
    </div>
  )
}

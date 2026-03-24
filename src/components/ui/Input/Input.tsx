import type { ChangeEvent, ReactNode } from "react"
import styles from "./Input.module.css"

interface InputProps {
  label?: string
  type?: string
  placeholder?: string
  value?: string
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void
  required?: boolean
  error?: string
  className?: string
  children?: ReactNode
  defaultValue?: string
}

export function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  required,
  error,
  className = "",
  children,
  defaultValue,
}: InputProps) {
  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      {children ?? (
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          className={`${styles.input} ${error ? styles.inputError : ""}`}
        />
      )}
      {error && <span className={styles.errorMsg}>{error}</span>}
    </div>
  )
}

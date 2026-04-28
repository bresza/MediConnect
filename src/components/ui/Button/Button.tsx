import type { ReactNode } from "react"
import styles from "./Button.module.css"

type ButtonVariant = "primary" | "ghost" | "danger" | "outline"
type ButtonSize    = "sm" | "md"

interface ButtonProps {
  children:   ReactNode
  onClick?:   () => void
  variant?:   ButtonVariant
  size?:      ButtonSize
  icon?:      ReactNode
  type?:      "button" | "submit"
  disabled?:  boolean
  loading?:   boolean
  fullWidth?: boolean
  title?:     string
}

const VARIANT_STYLE: Record<ButtonVariant, string> = {
  primary: styles.primary,
  ghost:   styles.ghost,
  danger:  styles.danger,
  outline: styles.outline,
}

const SIZE_STYLE: Record<ButtonSize, string> = {
  md: styles.md,
  sm: styles.sm,
}

const Spinner = () => (
  <svg
    className={styles.spinner}
    width="14" height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
)

export function Button({
  children,
  onClick,
  variant   = "primary",
  size      = "md",
  icon,
  type      = "button",
  disabled,
  loading   = false,
  fullWidth = false,
  title,
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      className={[
        styles.btn,
        VARIANT_STYLE[variant],
        SIZE_STYLE[size],
        fullWidth ? styles.fullWidth : "",
      ].join(" ")}
    >
      {loading ? <Spinner /> : icon ? icon : null}
      {children}
    </button>
  )
}

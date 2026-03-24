import type { ReactNode } from "react"
import styles from "./Button.module.css"

type ButtonVariant = "primary" | "ghost" | "danger" | "outline"
type ButtonSize    = "sm" | "md"

interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  type?: "button" | "submit"
  disabled?: boolean
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

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  icon,
  type = "button",
  disabled,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${styles.btn} ${VARIANT_STYLE[variant]} ${SIZE_STYLE[size]}`}
    >
      {icon && icon}
      {children}
    </button>
  )
}

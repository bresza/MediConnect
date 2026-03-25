import type { ReactNode, CSSProperties, MouseEvent } from "react"
import styles from "./Card.module.css"

interface CardProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
}

export function Card({ children, className = "", style, onClick }: CardProps) {
  const cls = [
    styles.card,
    onClick ? styles.clickable : "",
    className,
  ].filter(Boolean).join(" ")

  return (
    <div onClick={onClick} style={style} className={cls}>
      {children}
    </div>
  )
}

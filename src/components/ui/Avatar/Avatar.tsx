import { getInitials } from "../../../utils"
import styles from "./Avatar.module.css"

interface AvatarProps {
  name: string
  photoUrl?: string | null
  size?: "sm" | "md" | "lg" | "xl"
}

const SIZE_STYLE = { sm: styles.sm, md: styles.md, lg: styles.lg, xl: styles.xl }

export function Avatar({ name, photoUrl, size = "md" }: AvatarProps) {
  const className = `${styles.avatar} ${SIZE_STYLE[size]}`
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${className} ${styles.photo}`}
      />
    )
  }
  return (
    <div className={className}>
      {getInitials(name)}
    </div>
  )
}

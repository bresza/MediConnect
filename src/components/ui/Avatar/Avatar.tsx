import { getInitials } from "../../../utils"
import styles from "./Avatar.module.css"

interface AvatarProps {
  name: string
  size?: "sm" | "md" | "lg" | "xl"
  src?: string
}

const SIZE_STYLE = { sm: styles.sm, md: styles.md, lg: styles.lg, xl: styles.xl }

export function Avatar({ name, size = "md", src }: AvatarProps) {
  return (
    <div className={`${styles.avatar} ${SIZE_STYLE[size]}`}>
      {src ? <img src={src} alt={name} className={styles.image} /> : getInitials(name)}
    </div>
  )
}

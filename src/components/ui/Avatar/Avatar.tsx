import { getInitials } from "../../../utils"
import styles from "./Avatar.module.css"

interface AvatarProps {
  name: string
  size?: "sm" | "md" | "lg"
}

const SIZE_STYLE = { sm: styles.sm, md: styles.md, lg: styles.lg }

export function Avatar({ name, size = "md" }: AvatarProps) {
  return (
    <div className={`${styles.avatar} ${SIZE_STYLE[size]}`}>
      {getInitials(name)}
    </div>
  )
}

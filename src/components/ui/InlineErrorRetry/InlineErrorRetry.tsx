import { Button } from "../Button/Button"
import styles from "./InlineErrorRetry.module.css"

interface InlineErrorRetryProps {
  message: string
  onRetry: () => void
}

export function InlineErrorRetry({ message, onRetry }: InlineErrorRetryProps) {
  return (
    <div className={styles.wrap} role="alert">
      <p className={styles.message}>{message}</p>
      <Button variant="outline" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  )
}

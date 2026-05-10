import { useCallback, useState } from "react"
import { Button } from "../Button/Button"
import styles from "./RefreshButton.module.css"

interface RefreshButtonProps {
  onRefresh: () => void | Promise<unknown>
  label?: string
  loadingLabel?: string
  title?: string
  size?: "sm" | "md"
  variant?: "primary" | "ghost" | "outline"
}

const RefreshIcon = ({ spinning }: { spinning: boolean }) => (
  <svg
    width="14" height="14"
    viewBox="0 0 24 24"
    fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={spinning ? styles.spinning : undefined}
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
  </svg>
)

export function RefreshButton({
  onRefresh,
  label = "Atualizar",
  loadingLabel = "Atualizando...",
  title = "Atualizar dados",
  size = "sm",
  variant = "ghost",
}: RefreshButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = useCallback(async () => {
    if (isLoading) return
    setIsLoading(true)
    try {
      await onRefresh()
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, onRefresh])

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={isLoading}
      title={title}
      icon={<RefreshIcon spinning={isLoading} />}
    >
      {isLoading ? loadingLabel : label}
    </Button>
  )
}

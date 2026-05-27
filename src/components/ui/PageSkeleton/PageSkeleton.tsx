import styles from "./PageSkeleton.module.css"

export function PageSkeleton() {
  return (
    <div className={styles.wrap} role="status" aria-busy="true" aria-label="Carregando conteúdo">
      <div className={styles.bar} />
      <div className={styles.grid}>
        <div className={styles.card} />
        <div className={styles.card} />
        <div className={styles.cardWide} />
      </div>
    </div>
  )
}

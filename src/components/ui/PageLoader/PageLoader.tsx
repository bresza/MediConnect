import styles from "./PageLoader.module.css"

export function PageLoader() {
  return (
    <div className={styles.wrap} role="status" aria-busy="true" aria-label="Carregando página">
      <span className={styles.spinner} aria-hidden />
      <span className={styles.label}>Carregando…</span>
    </div>
  )
}

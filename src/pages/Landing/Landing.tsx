import styles from "./Landing.module.css"

/** Landing de marketing (HTML original em public/landing.html). */
export function Landing() {
  return (
    <iframe
      className={styles.frame}
      src="/landing.html"
      title="MediConnect — Gestão Clínica Inteligente"
    />
  )
}

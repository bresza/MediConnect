import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react"
import styles from "./SearchSelect.module.css"

export interface SearchSelectOption {
  value: string
  label: string
}

interface SearchSelectProps {
  label?: string
  id?: string
  options: SearchSelectOption[]
  value?: string
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void
  required?: boolean
  disabled?: boolean
  error?: string
  hint?: string
  placeholder?: string
  searchPlaceholder?: string
  className?: string
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export function SearchSelect({
  label,
  id,
  options,
  value = "",
  onChange,
  required,
  disabled,
  error,
  hint,
  placeholder = "Selecione",
  searchPlaceholder = "Buscar...",
  className = "",
}: SearchSelectProps) {
  const autoId = useId()
  const controlId = id ?? autoId
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [focusedIndex, setFocusedIndex] = useState(-1)

  const sortedOptions = useMemo(
    () => [...options].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [options],
  )

  const filteredOptions = useMemo(() => {
    const q = normalizeText(query)
    if (!q) return sortedOptions
    return sortedOptions.filter((option) => normalizeText(option.label).includes(q))
  }, [query, sortedOptions])

  const selected = sortedOptions.find((option) => option.value === value) ?? null

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery("")
        setFocusedIndex(-1)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        setQuery("")
        setFocusedIndex(-1)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      window.setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open])

  function emitChange(nextValue: string) {
    onChange?.({ target: { value: nextValue } } as ChangeEvent<HTMLSelectElement>)
  }

  function handleSelect(option: SearchSelectOption) {
    emitChange(option.value)
    setOpen(false)
    setQuery("")
    setFocusedIndex(-1)
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
    }
  }

  function handleListKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    if (!open || filteredOptions.length === 0) return

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setFocusedIndex((current) => (current + 1) % filteredOptions.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setFocusedIndex((current) => (current <= 0 ? filteredOptions.length - 1 : current - 1))
    } else if (event.key === "Enter" && focusedIndex >= 0) {
      event.preventDefault()
      handleSelect(filteredOptions[focusedIndex])
    }
  }

  return (
    <div className={`${styles.wrapper} ${className}`} ref={rootRef}>
      {label && (
        <label htmlFor={controlId} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}

      <div className={styles.control}>
        <button
          id={controlId}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={[
            styles.trigger,
            open ? styles.triggerOpen : "",
            error ? styles.triggerError : "",
            disabled ? styles.triggerDisabled : "",
            !selected ? styles.triggerPlaceholder : "",
          ].join(" ")}
          onClick={() => {
            if (disabled) return
            setOpen((current) => !current)
            setQuery("")
            setFocusedIndex(-1)
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          {selected?.label ?? placeholder}
        </button>

        <svg
          className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {open && (
          <div className={styles.panel}>
            <div className={styles.searchWrap}>
              <svg
                className={styles.searchIcon}
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                className={styles.searchInput}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setFocusedIndex(0)
                }}
                aria-label={`Buscar ${label ?? "opções"}`}
              />
            </div>

            {filteredOptions.length === 0 ? (
              <p className={styles.empty}>Nenhum resultado encontrado.</p>
            ) : (
              <ul
                className={styles.list}
                role="listbox"
                aria-label={label ?? "Opções"}
                onKeyDown={handleListKeyDown}
              >
                {filteredOptions.map((option, index) => {
                  const isSelected = option.value === value
                  const isFocused = index === focusedIndex
                  return (
                    <li key={option.value} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={[
                          styles.option,
                          isSelected ? styles.optionSelected : "",
                          isFocused ? styles.optionFocused : "",
                        ].join(" ")}
                        onMouseEnter={() => setFocusedIndex(index)}
                        onClick={() => handleSelect(option)}
                      >
                        <span className={styles.optionLabel}>{option.label}</span>
                        {isSelected && (
                          <svg
                            className={styles.checkIcon}
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.errorMsg}>{error}</span>}
    </div>
  )
}

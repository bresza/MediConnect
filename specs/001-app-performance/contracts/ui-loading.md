# Contract: UI Loading & Errors

**Version**: 1.0 | **Feature**: 001-app-performance

## Timing (FR-002, SC-006)

| Event | UI response |
|-------|-------------|
| Route chunk loading | `PageLoader` via `Suspense` after 0 ms (always for route) |
| Data fetch > 300 ms | Show skeleton or spinner overlay on content area |
| Data fetch ≤ 300 ms | No skeleton (avoid flash) |
| Background refetch | Subtle indicator OR no overlay if stale data visible |
| Blank content | MUST NOT exceed 3 s without indicator (SC-006) |

## Route level

```tsx
<Suspense fallback={<PageLoader />}>
  {activePage}
</Suspense>
```

- `PageLoader` MUST include `role="status"` and `aria-busy="true"`.
- Portuguese label: "Carregando…"

## Page data level

Each list/detail page MUST handle:

```ts
const { data, isLoading, isError, error, refetch } = useXQuery(...)
```

| State | Render |
|-------|--------|
| `isLoading && !data` | `PageSkeleton` or table skeleton rows |
| `isError` | Inline message + button "Tentar novamente" → `refetch()` |
| `data` | Main content |
| `isFetching && data` | Optional small refresh indicator |

## Sidebar / shell

- Sidebar MUST stay interactive during page data load (FR-007).
- Module switch MUST cancel in-flight route transition only; in-flight queries may complete in cache.

## Error messages (FR-009)

| Condition | Copy (PT) |
|-----------|-----------|
| Network offline | "Sem conexão. Verifique a internet e tente novamente." |
| Timeout | "A operação demorou demais. Tente novamente." |
| 403 | "Você não tem permissão para esta ação." |
| 5xx | "Erro no servidor. Tente novamente em instantes." |

- Toast MAY duplicate inline error for mutations.

## Long operations (FR-007)

Reports/export:
- Show non-blocking progress (toast or modal).
- User CAN navigate away; operation continues or offers cancel if supported.

## Portal paciente

Same rules on: consultas, mensagens, perfil — essential fields first (FR-003), secondary blocks lazy.

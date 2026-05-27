# Research: Melhorar Performance do MediConnect

**Feature**: `001-app-performance` | **Date**: 2026-05-26

## R1 — Client data fetching strategy

**Decision**: Adopt **TanStack Query v5** (`@tanstack/react-query`) with a single `QueryClientProvider` at app root (wrapping `AppRouter` or inside `AuthProvider` after session is known).

**Rationale**:
- Current hooks (`usePatients`, `useAppointments`, etc.) each `useEffect` → full refetch; no deduplication.
- `getAppointments`, `getPrescriptions`, `getFinancialRecords`, and `getReports` each re-fetch slim patient lists in parallel.
- Query keys (`['patients']`, `['appointments', { from, to }]`) eliminate duplicate network work and give `isLoading`/`isFetching` for FR-002.

**Alternatives considered**:
| Alternative | Rejected because |
|-------------|------------------|
| Manual `Map` cache in context | Every mutation needs custom invalidation; easy to drift |
| Migrate to `@supabase/supabase-js` realtime | Larger refactor; out of scope; REST layer works with RLS |
| SWR | Less ecosystem fit with future devtools; TanStack Query is standard for React 18 |

## R2 — Eager vs lazy data loading

**Decision**: **Tiered loading** in `AppRouter`:

| Tier | Data | When |
|------|------|------|
| T0 | Auth session, clinic context | Login |
| T1 | Patients (paginated/slim), appointments (date window default: today ± 30d) | After auth, all staff roles |
| T2 | Medical, financial, staff | `enabled: canAccess(page)` OR first navigation to module |
| T3 | Reports aggregate | Dashboard/Reports page only, shared query key |
| T4 | Patient portal scoped data | Patient role only via `usePatientAIData` |

**Rationale**: Spec P1/P3 require fast module switch but not loading entire history at login. Current always-on hooks block SC-002.

**Alternatives considered**:
- Keep all hooks eager — fails SC-002/SC-005 at scale.
- Full route-only data — breaks AIAssistant context until lazy prefetch; prefetch T1 + hydrate AI context from cache.

## R3 — List performance (search & scroll)

**Decision**:
1. **Server-side**: debounced search triggers REST with `ilike` + `limit` (e.g. 50) for Patients; appointments filtered by `scheduled_at` range.
2. **Client-side**: **`@tanstack/react-virtual`** for rendered rows when list > 100 items in memory.
3. **Debounce**: 300 ms on search input (aligns FR-002 feedback threshold).

**Rationale**: SC-003 requires ≤ 1 s search at 500 patients; rendering 500 DOM rows violates FR-006.

**Alternatives considered**:
- Client-only filter on full download — works only until ~500 rows; contradicts progressive loading (story P2).
- `react-window` — viable; TanStack Virtual pairs with TanStack Query ecosystem.

## R4 — Bundle & route splitting

**Decision**: Keep `lazyPages.tsx`; add Vite `build.rollupOptions.output.manualChunks`:

```ts
manualChunks: {
  'vendor-react': ['react', 'react-dom'],
  'vendor-fullcalendar': [/^@fullcalendar\//],
  'vendor-blocknote': [/^@blocknote\//],
  'vendor-mantine': [/^@mantine\//],
}
```

**Rationale**: Lazy routes already split pages; vendors still duplicate/heavy on first open of Appointments/Reports (P1 module switch).

**Alternatives considered**:
- Dynamic `import()` inside components only — partial; manualChunks stabilizes cache across navigations.

## R5 — Loading & error UX (network degradation)

**Decision**: Standardize on:
- **Global**: `Suspense` + `PageLoader` (existing) for route chunks.
- **Data**: per-page skeleton when `isLoading && !data`; stale-while-revalidate shows previous data when refetching (TanStack `placeholderData` / `keepPreviousData`).
- **Errors**: map `apiRequest` failures to toast + inline retry button; timeout 15 s default (configurable).

**Rationale**: SC-006 and FR-009; `AppRouter` currently ignores hook `isLoading` → blank tables.

## R6 — Baseline & measurement

**Decision**: Capture baseline **before** implementation using Chrome Performance + Network (throttling Fast 3G) for scripted flow in [quickstart.md](./quickstart.md). Optional: `vite build --mode analyze` with `rollup-plugin-visualizer` (devDependency).

**Rationale**: SC-005 requires −40% vs baseline; without numbers, success criteria are unverifiable.

## R7 — Database / API optimizations

**Decision**: Prefer **query shaping** first; add Supabase indexes only if EXPLAIN shows seq scans on:
- `patients(clinic_id, full_name)` for search
- `appointments(clinic_id, scheduled_at)`
- `messages(clinic_id, created_at DESC)`

**Rationale**: PostgREST already enforces RLS; indexes are low-risk additive migrations.

**Alternatives considered**:
- Materialized views for reports — premature; `getReports` dedupe via Query sufficient for v1.

## R8 — Testing strategy

**Decision**:
- Add **Vitest** + **@testing-library/react** for `QueryClient` hooks and debounce utils.
- Manual/Lighthouse checklist for SC-001–004 until Playwright is adopted project-wide.

**Rationale**: No test infra today; blocking full E2E would delay P1 wins.

## Open Items (non-blocking)

- Playwright smoke for login → agenda flow (future).
- Service Worker / offline — out of scope per spec assumptions.

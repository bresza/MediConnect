# Tasks: Melhorar Performance do MediConnect

**Input**: Design documents from `/specs/001-app-performance/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Not explicitly requested in spec — Vitest setup included as infrastructure only; validation via [quickstart.md](./quickstart.md).

**Organization**: Tasks grouped by user story (P1→P4) for independent delivery and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps to spec user stories US1–US4

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies, baseline metrics, and tooling

- [X] T001 Record performance baseline per specs/001-app-performance/quickstart.md §1 (store in sessionStorage as `perf-baseline`)
- [X] T002 Add `@tanstack/react-query` dependency in package.json
- [X] T003 [P] Add `@tanstack/react-virtual` dependency in package.json
- [X] T004 [P] Add Vitest + `@testing-library/react` devDependencies and `test` script in package.json
- [X] T005 [P] Configure Vitest in vite.config.ts (or vitest.config.ts) with jsdom environment

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Query layer, loading primitives, and API error contract — **MUST complete before user stories**

**⚠️ CRITICAL**: No user story work until this phase is done

- [X] T006 Create QueryClient defaults (staleTime, gcTime, retry) in src/hooks/query/queryClient.ts per specs/001-app-performance/contracts/data-fetch.md
- [X] T007 Create canonical query key helpers in src/hooks/query/queryKeys.ts per specs/001-app-performance/data-model.md
- [X] T008 Create QueryProvider wrapping authenticated tree in src/contexts/QueryProvider.tsx
- [X] T009 Wire QueryProvider in src/main.tsx (inside AuthProvider or equivalent app root)
- [X] T010 Create useDelayedLoading hook (300 ms threshold) in src/hooks/useDelayedLoading.ts per specs/001-app-performance/contracts/ui-loading.md
- [X] T011 [P] Create PageSkeleton component in src/components/ui/PageSkeleton/PageSkeleton.tsx and PageSkeleton.module.css
- [X] T012 [P] Add `role="status"`, `aria-busy="true"`, and PT label to src/components/ui/PageLoader/PageLoader.tsx
- [X] T013 Extend src/services/api.ts with ApiError type, timeout (15 s), and structured error mapping for FR-009
- [X] T014 Export query module from src/hooks/index.ts

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 — Navegação ágil no dia a dia da clínica (Priority: P1) 🎯 MVP

**Goal**: Transições rápidas entre módulos principais com cache deduplicado, chunks otimizados e feedback de carregamento (SC-001, FR-001/002/004)

**Independent Test**: Usuário autenticado alterna Dashboard → Pacientes → Agenda → Mensagens → Financeiro → Configurações; cada tela interativa ≤ 2 s (P95); spinner se > 300 ms; retorno a módulo recente perceptivelmente mais rápido

### Implementation for User Story 1

- [X] T015 [P] [US1] Refactor usePatients to TanStack Query with invalidation in src/hooks/usePatients.ts
- [X] T016 [P] [US1] Refactor useAppointments to TanStack Query with date-range key in src/hooks/useAppointments.ts
- [X] T017 [US1] Implement tiered T1/T2 loading flags (patients+appointments vs deferred domains) in src/AppRouter.tsx
- [X] T018 [P] [US1] Create useReportsQuery shared hook in src/hooks/query/useReportsQuery.ts calling src/services/domain.ts
- [X] T019 [US1] Deduplicate inline patient fetches inside src/services/appointments.ts using queryClient or shared slim patient fetch
- [X] T020 [US1] Remove duplicate getReports() mount fetch from src/pages/Dashboard/Dashboard.tsx; consume useReportsQuery
- [X] T021 [US1] Remove duplicate getReports() mount fetch from src/pages/Reports/Reports.tsx; consume useReportsQuery
- [X] T022 [P] [US1] Configure build.rollupOptions.output.manualChunks in vite.config.ts for fullcalendar, blocknote, mantine, react
- [X] T023 [US1] Wire PageSkeleton via useDelayedLoading for active page content area in src/AppRouter.tsx
- [X] T024 [P] [US1] Add optional route-chunk prefetch on Sidebar item hover in src/components/layout/Sidebar/Sidebar.tsx
- [X] T025 [US1] Ensure Suspense fallback uses PageLoader for all lazy routes in src/AppRouter.tsx

**Checkpoint**: US1 independently testable — module navigation meets SC-001 baseline direction

---

## Phase 4: User Story 2 — Listas e buscas rápidas com volume real de dados (Priority: P2)

**Goal**: Buscas ≤ 1 s e rolagem fluida em listas longas com paginação REST e virtualização (SC-003, FR-005/006)

**Independent Test**: Lista com 500 pacientes — busca com debounce retorna ≤ 1 s; rolagem em pacientes/mensagens/financeiro sem congelamento prolongado

### Implementation for User Story 2

- [X] T026 [P] [US2] Add paginated slim list + ilike search params to getPatients in src/services/patients.ts (select minimal columns, limit/offset)
- [X] T027 [P] [US2] Add scheduled_at range filters and slim select to getAppointments in src/services/appointments.ts
- [X] T028 [US2] Create useDebouncedValue hook (300 ms) in src/hooks/useDebouncedValue.ts
- [X] T029 [US2] Integrate debounced server-side search and query key filters in src/pages/Patients/Patients.tsx
- [X] T030 [P] [US2] Add @tanstack/react-virtual row virtualization to patient list in src/pages/Patients/Patients.tsx
- [X] T031 [P] [US2] Add progressive loading / virtualization to message list in src/pages/Messages/Messages.tsx
- [X] T032 [P] [US2] Add pagination or virtualization to financial records list in src/pages/Financial/Financial.tsx
- [X] T033 [US2] Optimize appointments list/calendar data binding to avoid full re-render on scroll in src/pages/Appointments/Appointments.tsx
- [X] T034 [P] [US2] Add paginated messages fetch helper in src/services/messaging.ts if not present

**Checkpoint**: US2 independently testable — search and scroll meet SC-003

---

## Phase 5: User Story 3 — Primeiro acesso e retorno sem frustração (Priority: P3)

**Goal**: Tela inicial pós-login ≤ 4 s; dados secundários não bloqueiam interação; portal prioriza conteúdo essencial (SC-002, FR-003/010)

**Independent Test**: Login cold start — home interativa ≤ 4 s (P90); Dashboard usable before reports fully hydrate; portal shows consultas/messages essentials first

### Implementation for User Story 3

- [X] T035 [P] [US3] Gate useMedicalData with enabled flag by pageId/role in src/hooks/useMedicalData.ts and src/AppRouter.tsx
- [X] T036 [P] [US3] Gate useFinancial with enabled by pageId; remove duplicate useFinancial fetch in src/pages/Financial/Financial.tsx (use router/query data)
- [X] T037 [P] [US3] Gate useStaff with enabled by pageId in src/hooks/useStaff.ts and src/AppRouter.tsx
- [X] T038 [US3] Defer attachPatientPhotos / storage bucket scan to profile open in src/services/patients.ts
- [X] T039 [US3] Show Dashboard KPI shell first; load reports via useReportsQuery without blocking layout in src/pages/Dashboard/Dashboard.tsx
- [X] T040 [US3] Split PatientPortal into essential-first sections (consultas/messages) before secondary blocks in src/pages/PatientPortal/PatientPortal.tsx
- [X] T041 [P] [US3] Align usePatientAIData with shared query keys in src/hooks/usePatientAIData.ts

**Checkpoint**: US3 independently testable — login-to-home meets SC-002

---

## Phase 6: User Story 4 — Uso estável em redes mais lentas (Priority: P4)

**Goal**: Feedback ≤ 500 ms em rede lenta; erros acionáveis com retry; sem tela branca > 3 s (SC-006, FR-009)

**Independent Test**: DevTools Fast 3G — fluxos login, agenda, busca paciente, mensagem mostram indicador ≤ 500 ms; retry funciona após falha

### Implementation for User Story 4

- [X] T042 [US4] Implement retry (1x) and timeout handling in src/services/api.ts per specs/001-app-performance/contracts/data-fetch.md
- [X] T043 [P] [US4] Create InlineErrorRetry component (PT copy + refetch) in src/components/ui/InlineErrorRetry/InlineErrorRetry.tsx
- [X] T044 [US4] Wire InlineErrorRetry and keepPreviousData/stale display on Patients in src/pages/Patients/Patients.tsx
- [X] T045 [P] [US4] Wire InlineErrorRetry on Appointments in src/pages/Appointments/Appointments.tsx
- [X] T046 [P] [US4] Wire InlineErrorRetry on Messages in src/pages/Messages/Messages.tsx
- [X] T047 [US4] Map offline/timeout/403/5xx messages to Portuguese toasts in src/services/api.ts and src/hooks/useToast.ts integration points

**Checkpoint**: US4 independently testable — degraded network UX meets SC-006

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Mutations, memoization, DB indexes, validation, regression (SC-005/007)

- [X] T048 Standardize queryClient.invalidateQueries on all CRUD mutations in src/hooks/usePatients.ts, src/hooks/useAppointments.ts, src/hooks/useMedicalData.ts, src/hooks/useFinancial.ts, src/hooks/useStaff.ts
- [X] T049 [P] Memoize visiblePatients and visibleAppointments filters in src/AppRouter.tsx with useMemo
- [X] T050 [P] Add optional Supabase indexes migration in supabase/migrations/ if EXPLAIN shows seq scans on patients/appointments/messages
- [X] T051 Re-run specs/001-app-performance/quickstart.md §2–7; document before/after metrics in specs/001-app-performance/quickstart-results.md
- [X] T052 Run npm run lint and npm run build; fix any TypeScript or bundle regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (T002–T005) — **blocks all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 — **MVP**
- **US2 (Phase 4)**: Depends on Phase 2 + T015–T016 (query hooks for patients/appointments)
- **US3 (Phase 5)**: Depends on Phase 2 + T017 (tiered loading in AppRouter)
- **US4 (Phase 6)**: Depends on Phase 2 + at least one page wired (T044–T046 can follow US1/US2 pages)
- **Polish (Phase 7)**: Depends on desired user stories complete

### User Story Dependencies

| Story | Depends on | Independent test |
|-------|------------|------------------|
| US1 (P1) | Foundational only | Module navigation ≤ 2 s |
| US2 (P2) | Foundational + patient/appointment query hooks | Search ≤ 1 s, smooth scroll |
| US3 (P3) | Foundational + AppRouter tier flags | Login → home ≤ 4 s |
| US4 (P4) | Foundational + page error wiring | Fast 3G feedback rules |

US2–US4 can proceed in parallel **after** their listed dependencies; US1 is the recommended first delivery.

### Parallel Opportunities

- **Phase 1**: T003, T004, T005 in parallel after T002
- **Phase 2**: T011, T012 in parallel
- **US1**: T015, T016, T018, T022, T024 in parallel; then T017, T019–T021, T023, T025
- **US2**: T026, T027, T034 in parallel; T030, T031, T032 in parallel after T029
- **US3**: T035, T036, T037, T041 in parallel
- **US4**: T043, T045, T046 in parallel
- **Polish**: T049, T050 in parallel

---

## Parallel Example: User Story 1

```bash
# Parallel batch 1 (after Phase 2):
T015: Refactor usePatients in src/hooks/usePatients.ts
T016: Refactor useAppointments in src/hooks/useAppointments.ts
T018: Create useReportsQuery in src/hooks/query/useReportsQuery.ts
T022: manualChunks in vite.config.ts
T024: Sidebar prefetch in src/components/layout/Sidebar/Sidebar.tsx

# Sequential integration:
T017: Tiered loading in src/AppRouter.tsx
T019–T021: Dedupe services + Dashboard/Reports
T023, T025: Loading shell + Suspense
```

---

## Parallel Example: User Story 2

```bash
# Parallel batch 1:
T026: src/services/patients.ts pagination
T027: src/services/appointments.ts date range
T034: src/services/messaging.ts pagination

# Then:
T028–T029: debounce + Patients page integration

# Parallel batch 2:
T030: Virtualize Patients list
T031: Virtualize Messages list
T032: Virtualize Financial list
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational (T006–T014) — **required**
3. Complete Phase 3: User Story 1 (T015–T025)
4. **STOP and VALIDATE**: quickstart §3 module transition test (SC-001)
5. Demo/deploy if acceptable

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate SC-001 → MVP release
3. US2 → validate SC-003
4. US3 → validate SC-002
5. US4 → validate SC-006
6. Polish → SC-005 (−40%) + SC-007 regression

### Parallel Team Strategy

| Developer | Focus after Phase 2 |
|-----------|---------------------|
| A | US1 (T015–T025) |
| B | US2 services + Patients (T026–T030) |
| C | US3 lazy gates (T035–T041) |
| D | US4 error UX (T042–T047) after T044 pages exist |

---

## Notes

- [P] tasks touch different files — avoid same-file parallel edits
- Commit after each phase checkpoint
- T001 baseline MUST run before implementation merges (SC-005 comparison)
- Do not remove existing features (FR-008) when optimizing queries
- All user-facing loading/error strings in Portuguese

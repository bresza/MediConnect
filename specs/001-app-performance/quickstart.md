# Quickstart: Performance Baseline & Validation

**Feature**: `001-app-performance`

## Prerequisites

- Node.js 20+
- `.env` with Supabase URL and anon key (existing project setup)
- Chrome or Edge DevTools
- Conta de teste: recepção/gestor + paciente portal

## 1. Establish baseline (before changes)

```powershell
cd C:\Users\larad\MediConnect
npm install
npm run dev
```

1. Abra `http://localhost:5173` em janela anônima.
2. DevTools → **Network** → disable cache; anote total requests e transferred no login.
3. DevTools → **Performance** → record during flow:

**Fluxo SC-005** (marcar tempo até interativo em cada passo):

| Step | Action | Stop when |
|------|--------|-----------|
| 1 | Login | Sidebar + default page clickable |
| 2 | Open Agenda | Calendar/list accepts click |
| 3 | Open Pacientes + search "silva" | Filtered list visible |
| 4 | Open patient profile | Profile form interactive |

4. Repita com **Network throttling: Fast 3G** (SC-006).
5. Salve HAR ou anote: total time step 1→4, request count, duplicate `/rest/v1/patients` calls.

Store baseline in `sessionStorage`:

```js
sessionStorage.setItem('perf-baseline', JSON.stringify({
  flow: 'login_agenda_search_profile',
  durationMs: 12345,
  networkProfile: 'broadband',
  recordedAt: new Date().toISOString(),
  patientsRequests: 5
}))
```

## 2. After implementation

```powershell
npm run build
npm run preview
```

Repeat steps above on preview build. Target: **≥ 40% reduction** in `durationMs` (SC-005).

## 3. Module transition test (SC-001)

Logged in as gestor, cycle: Dashboard → Pacientes → Agenda → Mensagens → Financeiro → Configurações.

- Each transition interactive ≤ **2 s** (95% of 20 runs).
- Spinner/skeleton visible if wait > **300 ms**.

## 4. Search test (SC-003)

Seed or use clinic with many patients. On Pacientes, type search term; after 300 ms debounce, results ≤ **1 s**.

## 5. Slow network (SC-006)

Fast 3G: no blank screen > **3 s**; loading indicator within **500 ms** on login, agenda, patient search, message view.

## 6. Bundle check

```powershell
npm run build
```

Inspect `dist/assets/*.js` — expect separate chunks for `fullcalendar`, `blocknote`, `mantine` after vite config change.

Optional analyzer:

```powershell
npm install -D rollup-plugin-visualizer
# add to vite.config per plan, then:
npm run build
```

## 7. Regression smoke (SC-007)

Manual checklist — must pass:

- [ ] Login/logout staff and patient
- [ ] CRUD paciente
- [ ] Criar/editar/cancelar consulta
- [ ] Enviar/visualizar mensagem
- [ ] Lançamento financeiro (se role)
- [ ] Relatório/export (se role)
- [ ] AI Assistant abre e responde (smoke)

## 8. Lint & typecheck

```powershell
npm run lint
npm run build
```

## 9. When Vitest is added

```powershell
npm test
```

Focus: query key invalidation, debounce helper, virtual list row count.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Duplicate patient fetches | Network tab — should be 1 per key after Query |
| Blank tables | `isLoading` wired? stale data kept while refetching? |
| Slow first Agenda open | FullCalendar chunk size; prefetch on Sidebar hover |
| Reports slow | Single `['reports']` query shared Dashboard/Reports |

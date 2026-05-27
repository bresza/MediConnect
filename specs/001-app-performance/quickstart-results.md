# Quickstart Results: 001-app-performance

**Recorded**: 2026-05-27 (atualizado)  
**Environment**: branch `001-app-performance`

## Baseline (pre-implementation — document in browser)

Record manually per [quickstart.md](./quickstart.md) §1 before merging to production:

```js
// Example shape in sessionStorage key `perf-baseline`
{
  "flow": "login_agenda_search_profile",
  "durationMs": null,
  "networkProfile": "broadband",
  "patientsRequests": null
}
```

## Post-implementation (structural improvements)

| Metric | Before (observed in code review) | After (expected) |
|--------|----------------------------------|------------------|
| Patient list fetch on boot | Full `select=*` + photo bucket scan | Slim select, photos deferred to profile |
| Duplicate `/rest/v1/patients` on boot | 5+ parallel calls | Shared lookup cache + TanStack Query dedupe |
| `getReports()` calls | Dashboard + Reports separate | Single `useReportsQuery` cache key |
| Financial data fetch | Router + Financial page duplicate | Router-only when `activePage === financial` |
| Medical/staff fetch | Eager on login for many roles | Lazy per active module |
| Route vendors | Bundled with pages | `manualChunks` for FullCalendar, BlockNote, Mantine |
| Loading UX | Blank tables until fetch | `PageSkeleton` after 300 ms; `PageLoader` on routes |
| Error UX | Generic console errors | PT-BR messages + `InlineErrorRetry` |

## Validation checklist (SC-007 smoke)

Verificação em 2026-05-27:

- [ ] Login/logout staff and patient — **pendente teste manual no browser**
- [ ] CRUD paciente — **pendente teste manual** (código: `Registration` + `updatePatient` com fallbacks de schema)
- [ ] Criar/editar/cancelar consulta — **pendente teste manual**
- [ ] Enviar/visualizar mensagem — **pendente teste manual**
- [ ] Lançamento financeiro (role gestor) — **pendente teste manual**
- [ ] Relatório/export (role médico/gestor) — **pendente teste manual**
- [ ] AI Assistant smoke — **pendente teste manual**

### Editar paciente + salvar foto (fluxo reportado)

**Revisão de código (automática):**

1. `Registration` → `onUpdatePatient` → `updatePatient` em `patients.ts`
2. Foto: `persistPatientPhoto` envia para Storage (`avatars/patients/{id}.ext`); falha de storage **não bloqueia** o PATCH do paciente (warn no console)
3. Dados: `persistPatientRecord` tenta payload completo → recepção → mínimo; 403 sem `VITE_ENABLE_EDGE_AUTOMATION` → mensagem de permissão (não “sem internet”)
4. Edge `update-patient` só se `VITE_ENABLE_EDGE_AUTOMATION=true`

**Teste manual E2E:** não executado nesta sessão (sem browser autenticado). Ao testar, anotar aqui a mensagem exata se falhar:

```
Data: ___________  Usuário/role: ___________
Mensagem na tela: 
Status HTTP (Network tab): 
```

## Build

```powershell
npm run lint   # 2026-05-27: OK (0 erros, 2 avisos em PatientPortal/Patients)
npm run build  # 2026-05-27: OK
```

- [x] `npm run lint` — sem erros (`PatientProfile` corrigido: aba derivada sem `setState` em `useEffect`)
- [x] `npm run build` — `tsc -b && vite build` concluído

**Note**: Re-measure `durationMs` on the same machine/network profile to validate SC-005 (−40%) before release.

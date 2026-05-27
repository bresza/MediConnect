# Contract: Data Fetching

**Version**: 1.0 | **Feature**: 001-app-performance

## Provider

- `QueryClientProvider` wraps authenticated app tree.
- Default options:
  - `staleTime`: 30_000 ms (appointments/messages), 120_000 ms (patients list)
  - `gcTime`: 300_000 ms
  - `retry`: 1 for network errors; no retry on 401/403
  - `refetchOnWindowFocus`: true for `appointments`, `messages`

## Query keys

```ts
// Canonical shapes (TypeScript)
type PatientFilters = { search?: string; limit?: number; offset?: number }
type AppointmentRange = { from: string; to: string } // ISO date

['patients', clinicId, PatientFilters]
['appointments', clinicId, AppointmentRange]
['reports', clinicId]
['financial', clinicId]
['staff', clinicId]
['messages', clinicId, { cursor?: string }]
```

## Enablement rules

| Query | `enabled` when |
|-------|----------------|
| patients | authenticated staff/patient context |
| appointments | authenticated; staff always; patient portal scoped |
| medical | `loadMedical === true` (existing AppRouter flags) |
| financial | `loadFinancial === true` OR `pageId === 'financial'` |
| staff | `loadStaff === true` OR `pageId === 'team'` |
| reports | `pageId === 'dashboard' \|\| pageId === 'reports'` |

## REST shaping (via `apiRequest`)

### Patients list (search)

```
GET /rest/v1/patients?select=id,full_name,phone,email,status&...filters...&limit=50&offset=0
```

- MUST NOT use `select=*` for list views.
- Photo URLs: lazy load on profile open OR batch endpoint; not on initial list.

### Appointments

```
GET /rest/v1/appointments?scheduled_at=gte.{from}&scheduled_at=lte.{to}&select=...
```

- Default range: today − 30 days → today + 90 days.

### Deduplication

- Any function that previously issued inline `patients?select=id,full_name` MUST read from `queryClient.getQueryData(['patients', ...])` or use `queryClient.fetchQuery` with same key.

## Mutations

After successful mutation:

```ts
queryClient.invalidateQueries({ queryKey: ['patients', clinicId] })
// + entity-specific keys
```

- Optimistic updates optional for appointment drag; not required v1.

## Service layer

- `src/services/api.ts` remains single HTTP entry; no direct `fetch` in components.
- Errors: throw `ApiError` with `status`, `message` for UI contract.

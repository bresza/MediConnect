# Data Model: Performance Domain

**Feature**: `001-app-performance` | **Date**: 2026-05-26

This document models **performance-related state and entities**, not full clinical schema. It maps spec [Key Entities](./spec.md#key-entities) to application concepts.

## Entities

### Module (`PageId`)

| Field | Description |
|-------|-------------|
| `id` | `PageId` union — dashboard, patients, appointments, messages, financial, settings, team, reports, patient-portal, … |
| `tier` | Data tier T0–T4 (see plan.md) required before interactive |
| `chunkId` | Lazy import id in `lazyPages.tsx` |

**Relationships**: User session selects active module; determines which queries have `enabled: true`.

### Lista operacional

| Field | Description |
|-------|-------------|
| `entityType` | `patients` \| `appointments` \| `messages` \| `financial_records` |
| `filters` | Search text, date range, doctor_id, status |
| `page` | Cursor/offset for REST |
| `pageSize` | Default 50 (patients search), 100 (messages history) |
| `totalCount` | From `Content-Range` header when available |

**Validation**:
- `pageSize` ∈ [10, 200]
- Appointment default window: `[today - 30d, today + 90d]` unless user expands

### Sessão de usuário (performance context)

| Field | Description |
|-------|-------------|
| `userId` | Auth user |
| `role` | Drives `canAccess` / hook `enabled` |
| `clinicId` | Implicit in RLS — all queries scoped |
| `visitedModules` | Set of `PageId` — used for prefetch on hover (optional P1 enhancement) |
| `sessionStartedAt` | For metrics |

**State transitions**:
`anonymous` → `authenticating` → `hydrating_t1` → `ready` → (`navigating_module`) → `ready`

### Operação demorada

| Field | Description |
|-------|-------------|
| `id` | UUID client-side |
| `type` | `report_export` \| `bulk_sync` \| `ai_summary` |
| `status` | `pending` \| `running` \| `done` \| `failed` |
| `blocking` | If false, UI navigation allowed (FR-007) |
| `progress` | 0–100 optional |

**Rules**: `blocking: false` MUST NOT disable Sidebar navigation.

### Indicador de experiência (UI state)

| Field | Description |
|-------|-------------|
| `surface` | `route` \| `page_data` \| `mutation` |
| `phase` | `idle` \| `loading` \| `ready` \| `degraded` \| `error` |
| `startedAt` | Timestamp when loading began |
| `showSpinner` | true if elapsed > 300 ms (FR-002) |

**Transitions**:
- `idle` → `loading` on fetch start
- `loading` → `ready` on success
- `loading` → `error` on failure (retry available)
- `ready` → `loading` on background refetch (show subtle indicator, not full-page blank)

## Query cache keys (TanStack Query)

| Key pattern | Invalidated on |
|-------------|----------------|
| `['patients', clinicId, filters]` | create/update/delete patient |
| `['appointments', clinicId, range]` | appointment CRUD |
| `['reports', clinicId]` | medical record / prescription changes |
| `['financial', clinicId]` | financial record CRUD |
| `['staff', clinicId]` | staff CRUD |
| `['messages', clinicId, cursor]` | send/receive message |

## Domain tables (Supabase — read shaping only)

Existing tables; performance feature adds **access patterns**, not new tables:

| Table | Performance-relevant access |
|-------|----------------------------|
| `patients` | `select=id,full_name,phone,...` + `ilike` search + pagination |
| `appointments` | Filter `scheduled_at` range; avoid `select=*` |
| `messages` | Order `created_at desc` + `limit` |
| `financial_records` | Paginate by month |
| `prescriptions` / medical | Load with reports query only |

## Metrics record (ephemeral / local)

For baseline comparison (SC-005):

| Field | Type |
|-------|------|
| `flow` | `login_agenda_search_profile` |
| `durationMs` | number |
| `networkProfile` | `broadband` \| `fast3g` |
| `recordedAt` | ISO datetime |
| `buildSha` | git commit optional |

Stored in sessionStorage during QA runs (see quickstart.md); not persisted to DB in v1.

# Tabela `reports` (laudos e workarounds)

Fonte: OpenAPI Reports (`GET /rest/v1/reports`).

## Colunas (resposta)

| Coluna | Tipo | Notas |
|--------|------|--------|
| `id` | uuid | |
| `order_number` | string | ex. `REP-2025-00001` |
| `patient_id` | uuid | |
| `status` | enum | **`draft`** \| **`completed`** |
| `exam` | string | Nome do exame/laudo |
| `requested_by` | string | Médico solicitante |
| `cid_code` | string | CID-10 |
| `diagnosis` | string | |
| `conclusion` | string | |
| `content_html` | string | |
| `content_json` | object | TipTap / metadados (prontuário, receita, etc.) |
| `hide_date` | boolean | default false |
| `hide_signature` | boolean | default false |
| `due_at` | date-time | |
| `created_by` | uuid | |
| `updated_by` | uuid | |
| `created_at` | date-time | |
| `updated_at` | date-time | |

## GET — query params

| Param | Descrição |
|-------|-----------|
| `patient_id` | Filtrar por paciente (`eq.{uuid}` no PostgREST) |
| `status` | `draft` ou `completed` |
| `created_by` | Filtrar por médico criador |
| `order` | ex. `created_at.desc` |
| `select` | PostgREST — front usa lista explícita em `domain.ts` |

## Front

- Laudos: `getReports`, `createReport`, `updateReport` em `src/services/domain.ts`
- Status UI `Draft` / `Finalized` / `Sent` → API `draft` / `completed` (Sent grava como `completed`)
- Prontuário, receita e financeiro usam a mesma tabela com `exam` marcador; status final também `completed`

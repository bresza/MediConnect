# `public.doctor_availability`

Grade semanal de atendimento por médico (REST PostgREST).

## Colunas usadas no front

| Coluna | Tipo (API) | Observação |
|--------|------------|------------|
| `id` | uuid | PK |
| `doctor_id` | uuid | FK `doctors.id` |
| `weekday` | **enum** | **Não** enviar `0`–`6`. Valores: `domingo`, `segunda`, `terca`, `quarta`, `quinta`, `sexta`, `sabado` (ou inglês `sunday`…`saturday` em alguns ambientes). |
| `start_time` | time | `HH:mm` (ex.: `08:00`) |
| `end_time` | time | `HH:mm` (ex.: `14:00`) |
| `slot_minutes` | integer | 15–120 |
| `appointment_type` | enum | `presencial` \| `telemedicina` |
| `active` | boolean | default `true` |
| `created_by` | uuid | Recomendado no POST (usuário logado) |

## Implementação

- `src/services/availability.ts` — CRUD e conversão `weekday` UI (0–6) ↔ enum API.
- `src/services/appointments.ts` — busca slots com `weekday=eq.<enum>`.

## Erro comum

`invalid input value for enum weekday: "1"` — o front enviou número; a API exige o **nome** do dia (`segunda`, etc.).

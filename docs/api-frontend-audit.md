# Auditoria Front-end x API - MediConnect

**Contrato oficial:** [Apidog — RiseUP](https://do5wegrct3.apidog.io/)  
**Base URL:** `https://yuanqfswhberkoevtmfr.supabase.co`

Data: 2026-06-18

## Status

| Area | Endpoint/API (Apidog) | Status no front | Observacao |
| --- | --- | --- | --- |
| Autenticacao | `POST /auth/v1/token`, `POST /user-info` | Integrado | Login + `userInfo.ts` resolve `patient.id`. |
| Usuarios | `/functions/v1/create-user-with-password` | Integrado | Gestor, secretaria e admin (CPF + department obrigatorios; erros RFC 7807). |
| Usuarios | `/functions/v1/create-doctor` | Integrado | Medico pela tela Equipe (fluxo atomico auth+profiles+roles+doctors). |
| Usuarios | `/rest/v1/secretaries`, `/rest/v1/managers` | Integrado | Listagem e PATCH na edicao de equipe. |
| Usuarios | `/delete-user` | Integrado com fallback | Exclusao tenta hard delete documentado; fallback REST apenas se endpoint nao existir no ambiente. |
| Pacientes | `/functions/v1/create-patient`, `/register-patient-with-password` | Integrado | Staff: create-patient + create-user-with-password; auto-cadastro: register-patient-with-password. |
| Pacientes | `/rest/v1/patients` | Integrado | Criacao/edicao com CPF obrigatorio e validacao no front. |
| Medicos | `/rest/v1/doctors`, `/functions/v1/create-doctor` | Integrado | Listagem e cadastro via create-doctor (nao mais create-user-with-password). |
| Agendamentos | `/rest/v1/appointments` | Integrado | Listagem, criacao e atualizacao. |
| Agendamentos | `/functions/v1/get-available-slots` | Integrado | Modal de agendamento consulta slots reais por medico/data. |
| Disponibilidade | `/rest/v1/doctor_availability` | Parcial | API existe, mas ainda falta tela administrativa para CRUD de disponibilidade. |
| Excecoes de agenda | `/rest/v1/doctor_exceptions` | Pendente | API existe, mas ainda falta UI para feriados, bloqueios e plantões. |
| Reports/Laudos | `GET /rest/v1/reports?patient_id=&status=completed` | Integrado | Staff lista tudo; portal usa filtro documentado. |
| Portal paciente — laudos | `user-info` + `GET /rest/v1/reports` | **Bloqueado por RLS** | Front chama certo; back precisa liberar leitura do paciente autenticado. |
| Prontuarios | Sem endpoint dedicado na API atual | Workaround controlado | Persistidos em `reports` com marcador `Prontuario Medico`. Deve migrar quando a API entregar endpoint proprio. |
| Receitas | Sem endpoint dedicado na API atual | Workaround controlado | Persistidas em `reports` com marcador `Receita Medica`. Deve migrar quando houver endpoint proprio. |
| Financeiro | Sem endpoint dedicado na API atual | Workaround controlado | Persistido em `reports` com marcador `Registro Financeiro`. Deve migrar quando a API financeira existir. |
| SMS | `/functions/v1/send-sms` | Integrado | Envio real de SMS. |
| Comunicacao | WhatsApp, e-mail, historico/templates | Pendente de API | Hoje historico/templates ainda usam mock local; API documenta SMS, mas nao endpoints completos para historico/templates. |
| Storage | `/storage/v1/object/avatars/{path}` | Pendente de UI | API existe, mas falta contrato de vinculacao do arquivo ao profile/patient no front sem quebrar `patients`. |
| Relatorios gerenciais | Nao documentado como endpoint especifico | Parcial | Dashboard usa dados existentes, mas faltam endpoints de analytics/absenteismo/performance. |
| Notificacoes/push | Nao documentado como endpoint especifico | Pendente de API | Documentacao do produto pede push/lembretes automaticos. |
| PDF/assinatura/versionamento | Nao documentado como endpoint especifico | Pendente de API | Laudos possuem campos basicos, mas nao ha contrato publicado para PDF, assinatura digital, protocolo e versoes. |

## Proxima ordem recomendada

1. Criar UI de disponibilidade medica usando `doctor_availability`.
2. Criar UI de excecoes de agenda usando `doctor_exceptions`.
3. Definir com o time da API contratos para comunicacao, financeiro, prontuario, receitas, analytics, PDF e assinatura.
4. Remover os workarounds em `reports` quando os endpoints dedicados forem publicados.

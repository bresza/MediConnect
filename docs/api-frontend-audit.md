# Auditoria Front-end x API - MediConnect

Data: 2026-05-20

## Status

| Area | Endpoint/API | Status no front | Observacao |
| --- | --- | --- | --- |
| Autenticacao | `/auth/v1/token`, `/functions/v1/user-info` | Integrado | Login usa Supabase Auth e busca perfil/roles. |
| Usuarios | `/functions/v1/create-user-with-password` | Integrado | Criacao com email+senha (sem magic link); CPF obrigatorio e validacao de senha minima no front. |
| Usuarios | `/functions/v1/create-doctor` | Integrado | Medico pela tela Equipe (fluxo atomico auth+profiles+roles+doctors). |
| Usuarios | `/rest/v1/secretaries`, `/rest/v1/managers` | Integrado | Listagem e PATCH na edicao de equipe. |
| Usuarios | `/delete-user` | Integrado com fallback | Exclusao tenta hard delete documentado; fallback REST apenas se endpoint nao existir no ambiente. |
| Pacientes | `/functions/v1/register-patient`, `/functions/v1/register-patient-with-password` | Integrado | Auto-cadastro com magic link ou senha; fallback para create-user/create-user-with-password em ambientes legados. |
| Pacientes | `/rest/v1/patients` | Integrado | Criacao/edicao com CPF obrigatorio e validacao no front. |
| Medicos | `/rest/v1/doctors`, `/functions/v1/create-doctor` | Integrado | Listagem e cadastro via create-doctor (nao mais create-user-with-password). |
| Agendamentos | `/rest/v1/appointments` | Integrado | Listagem, criacao e atualizacao. |
| Agendamentos | `/functions/v1/get-available-slots` | Integrado | Modal de agendamento consulta slots reais por medico com `start_date`, `end_date` e `appointment_type`. |
| Disponibilidade | `/rest/v1/doctor_availability` | Parcial | API existe, mas ainda falta tela administrativa para CRUD de disponibilidade. |
| Excecoes de agenda | `/rest/v1/doctor_exceptions` | Pendente | API existe, mas ainda falta UI para feriados, bloqueios e plantões. |
| Reports/Laudos | `/rest/v1/reports` | Integrado | Laudos usam tabela documentada e status aceito pela API. |
| Prontuarios | Sem endpoint dedicado na API atual | Workaround controlado | Persistidos em `reports` com marcador `Prontuario Medico`. Deve migrar quando a API entregar endpoint proprio. |
| Receitas | Sem endpoint dedicado na API atual | Workaround controlado | Persistidas em `reports` com marcador `Receita Medica`. Deve migrar quando houver endpoint proprio. |
| Financeiro | Sem endpoint dedicado na API atual | Workaround controlado | Persistido em `reports` com marcador `Registro Financeiro`. Deve migrar quando a API financeira existir. |
| SMS | `/functions/v1/send-sms` | Integrado | Envio real de SMS. |
| Autenticacao | `/functions/v1/request-password-reset` | Integrado | Solicita reset via endpoint publico; fallback em `/auth/v1/recover`. |
| Comunicacao | WhatsApp, e-mail, historico/templates | Pendente de API | Hoje historico/templates ainda usam mock local; API documenta SMS, mas nao endpoints completos para historico/templates. |
| Storage | `/storage/v1/object/avatars/{path}` | Pendente de UI | API existe, mas falta contrato de vinculacao do arquivo ao profile/patient no front sem quebrar `patients`. |
| Relatorios gerenciais | Nao documentado como endpoint especifico | Parcial | Dashboard usa dados existentes, mas faltam endpoints de analytics/absenteismo/performance. |
| Notificacoes/push | Nao documentado como endpoint especifico | Pendente de API | Documentacao do produto pede push/lembretes automaticos. |
| PDF/assinatura/versionamento | Nao documentado como endpoint especifico | Pendente de API | Laudos possuem campos basicos, mas nao ha contrato publicado para PDF, assinatura digital, protocolo e versoes. |

## Perfis e permissoes (frontend)

Matriz aplicada em `src/utils/permissions.ts` (`ROLE_PAGES`, `ROLE_ACTIONS`, `canViewClinicalData`).

| Modulo | Medico | Gestao/Admin | Financeiro | Secretaria |
| --- | :---: | :---: | :---: | :---: |
| Dashboard | sim | sim | sim | sim |
| Pacientes / cadastro basico | sim | sim | sim | sim |
| Perfil do paciente (administrativo) | sim | sim | sim | sim |
| Perfil do paciente (receitas/prontuario) | sim | sim | nao | nao |
| Agenda | propria | todas | nao | sim |
| Disponibilidade | propria | sim | nao | nao |
| Laudos (`reports`) | sim | sim | nao | nao |
| Atendimento com prontuario (agenda) | sim | nao | nao | nao |
| Mensagens | sim | sim | nao | sim |
| Financeiro | nao | sim | sim | nao |
| Equipe | nao | sim | nao | nao |
| Configuracoes | nao | sim | nao | nao |

Observacao: o controle acima e de UI/rotas. A API (RLS e Edge Functions) deve reforcar as mesmas regras.

## Proxima ordem recomendada

1. Criar UI de disponibilidade medica usando `doctor_availability`.
2. Criar UI de excecoes de agenda usando `doctor_exceptions`.
3. Definir com o time da API contratos para comunicacao, financeiro, prontuario, receitas, analytics, PDF e assinatura.
4. Remover os workarounds em `reports` quando os endpoints dedicados forem publicados.

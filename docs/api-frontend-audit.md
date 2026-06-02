# Auditoria Front-end x API - MediConnect

Data: 2026-05-20 (atualizado 2026-05-29: disponibilidade/exceções integradas, matriz de perfis e testes)

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
| Disponibilidade | `/rest/v1/doctor_availability` | Integrado | Tela `Availability` faz CRUD da grade semanal por médico. |
| Excecoes de agenda | `/rest/v1/doctor_exceptions` | Integrado | Tela `Availability` cobre feriados, bloqueios e plantões. |
| Reports/Laudos | `/rest/v1/reports` | Integrado | Laudos usam tabela documentada e status aceito pela API. |
| Prontuarios | Sem endpoint dedicado na API atual | Workaround controlado | Persistidos em `reports` com marcador `Prontuario Medico`. Deve migrar quando a API entregar endpoint proprio. |
| Receitas | Sem endpoint dedicado na API atual | Workaround controlado | Persistidas em `reports` com marcador `Receita Medica`. Deve migrar quando houver endpoint proprio. |
| Financeiro | Sem endpoint dedicado na API atual | Workaround controlado | Persistido em `reports` com marcador `Registro Financeiro`. Deve migrar quando a API financeira existir. |
| SMS | `/functions/v1/send-sms` | Integrado | Envio real de SMS. |
| Autenticacao | `/functions/v1/request-password-reset` | Integrado | Solicita reset via endpoint publico; fallback em `/auth/v1/recover`. |
| Comunicacao | WhatsApp, e-mail, historico/templates | Pendente de API | Hoje historico/templates ainda usam mock local; API documenta SMS, mas nao endpoints completos para historico/templates. |
| Storage | `/storage/v1/object/avatars/{userId}/avatar.{ext}` | Integrado | Upload `POST` multipart + download `GET` (sem `/public/`). Path `{userId}/avatar.jpg` em `patientPhoto.ts`. |
| Relatorios gerenciais | Nao documentado como endpoint especifico | Parcial | Dashboard usa dados existentes, mas faltam endpoints de analytics/absenteismo/performance. |
| Notificacoes/push | Nao documentado como endpoint especifico | Pendente de API | Documentacao do produto pede push/lembretes automaticos. |
| PDF/assinatura/versionamento | Nao documentado como endpoint especifico | Pendente de API | Laudos possuem campos basicos, mas nao ha contrato publicado para PDF, assinatura digital, protocolo e versoes. |

## Perfis e permissoes (frontend)

Matriz aplicada em `src/utils/permissions.ts` (`ROLE_PAGES`, `ROLE_ACTIONS`, helpers `canX`).
Coberta por testes em `src/utils/permissions.test.ts` e `src/services/resolveLoginRole.test.ts`.

**Paridade gestor ≡ admin:** `manager` e `admin` usam as mesmas constantes (`STAFF_FULL_PAGES`,
`STAFF_FULL_ACTIONS`) — acesso total a todos os módulos e ações (inclui equipe, exclusões,
configurações e fila de espera). Diferem apenas em rótulo/cor na UI.

| Modulo | Medico | Gestao (gestor/admin) | Financeiro | Secretaria |
| --- | :---: | :---: | :---: | :---: |
| Dashboard | sim | sim | sim | sim |
| Pacientes (listar/ver) | sim | sim | sim | sim |
| Cadastro de paciente (`register`) | sim | sim | nao | sim |
| Perfil do paciente (administrativo) | sim | sim | sim | sim |
| Perfil do paciente (receitas/prontuario) | sim | sim | nao | nao |
| Agenda | propria | todas | nao | sim |
| Disponibilidade | propria | sim | nao | nao |
| Fila de espera (editar) | sim | sim | nao | sim |
| Laudos (`reports`) | sim | sim | nao | nao |
| Atendimento com prontuario (agenda) | sim | nao | nao | nao |
| Mensagens | sim | sim | nao | sim |
| Financeiro | nao | sim | sim | nao |
| Equipe (incluir/editar/excluir) | nao | sim | nao | nao |
| Excluir pacientes/laudos | nao | sim | nao | nao |
| Configuracoes | nao | sim | nao | nao |

Observacao: o controle acima e de UI/rotas. A API (RLS e Edge Functions) deve reforcar as mesmas
regras — em especial garantir que `manager` tenha as mesmas políticas que `admin` no servidor.

### Resolução do papel no login

`resolveLoginRole` (`src/services/auth.ts`) deriva o `UserRole` de `user_roles`/`/user-info`/`profiles`,
com prioridade **admin > gestor > médico > financeiro > secretária > paciente**. Um vínculo em
`patients` **não** rebaixa um usuário de equipe a paciente (regressão do bug "staff vira paciente").

## Proxima ordem recomendada

1. Definir com o time da API contratos para comunicacao, financeiro, prontuario, receitas, analytics, PDF e assinatura.
2. Remover os workarounds em `reports` quando os endpoints dedicados forem publicados.
3. Templates de mensagens vêm de constante local em `Messages.tsx`; migrar para a API quando houver endpoint.

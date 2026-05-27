<!--
Sync Impact Report
- Version change: (unratified template) → 1.0.0
- Modified principles: placeholder → I. TypeScript Estrito, II. Supabase RLS,
  III. UX em Português, IV. Performance Percebida, V. Erros de API Claros
- Added sections: Stack & Restrições, Fluxo de Desenvolvimento
- Removed sections: none (initial ratification)
- Templates: plan-template.md ✅ | spec-template.md ✅ | tasks-template.md ✅
- Follow-up TODOs: none
-->

# MediConnect Constitution

## Core Principles

### I. TypeScript Estrito

Todo código de aplicação MUST ser TypeScript com `strict` habilitado no build (`tsc -b` sem erros).

- Tipos explícitos em fronteiras públicas (props, hooks, serviços exportados); evitar `any` salvo justificativa documentada.
- Novos módulos MUST compilar antes de merge; regressões de tipo são bloqueantes.
- Preferir tipos derivados de domínio existente (`src/types`) em vez de duplicar shapes.

**Rationale**: MediConnect é um sistema clínico; tipos incorretos causam bugs silenciosos em dados de pacientes e agenda.

### II. Supabase RLS (NON-NEGOTIABLE)

Acesso a dados MUST respeitar Row Level Security do Supabase em todas as operações.

- Queries REST (`src/services/api.ts`) MUST usar token autenticado; nunca contornar RLS no cliente.
- Novas tabelas ou endpoints MUST incluir políticas RLS antes de uso em produção.
- Filtros por clínica/usuário/papel MUST permanecer no servidor (RLS/policies), não apenas no UI.
- Edge Functions MUST validar identidade e escopo antes de mutações sensíveis.

**Rationale**: Dados de saúde exigem isolamento multi-tenant e controle por papel; confiar só no frontend é inaceitável.

### III. UX em Português

A interface MUST ser apresentada em português brasileiro para usuários finais (equipe e pacientes).

- Labels, mensagens de erro, toasts, confirmações e estados vazios MUST estar em PT-BR.
- Formatação de datas, moeda e telefones MUST seguir convenções brasileiras.
- Componentes interativos MUST manter acessibilidade (`aria-*`, contraste, foco visível).
- Termos técnicos internos (logs, código) podem ser em inglês; texto visível ao usuário, não.

**Rationale**: MediConnect atende clínicas no Brasil; inglês na UI aumenta erro operacional e reduz adoção.

### IV. Performance Percebida

A experiência MUST ser responsiva para fluxos críticos do dia a dia clínico.

- Navegação entre módulos principais MUST tornar a tela interativa em tempo aceitável (metas por feature em spec/plan).
- Operações que excedem 300 ms MUST exibir feedback visual (loader/skeleton), nunca tela em branco prolongada.
- Dados MUST ser carregados sob demanda quando possível; evitar fetch global desnecessário no boot.
- Listas grandes MUST usar paginação, virtualização ou filtros server-side — não renderizar milhares de nós DOM.
- Otimizações MUST NOT remover funcionalidades existentes como trade-off silencioso.

**Rationale**: Lentidão interrompe atendimento presencial; performance é requisito de produto, não luxo técnico.

### V. Erros de API Claros

Falhas de rede e API MUST ser tratadas de forma compreensível e acionável para o usuário.

- Toda chamada via `src/services/api.ts` MUST mapear erros para mensagens PT-BR (timeout, offline, 403, 5xx).
- UI MUST oferecer caminho de recuperação (ex.: "Tentar novamente") quando aplicável, sem exigir reload completo.
- Erros MUST NOT expor stack traces, tokens ou detalhes internos ao usuário final.
- Mutations falhas MUST preservar contexto do formulário quando seguro, para nova tentativa.

**Rationale**: Wi‑Fi instável em clínicas é comum; mensagens opacas geram abandono e chamadas de suporte.

## Stack & Restrições

| Camada | Padrão |
|--------|--------|
| Frontend | Vite, React 18, TypeScript |
| Dados | Supabase PostgreSQL + PostgREST + RLS |
| API cliente | `src/services/api.ts` (REST autenticado) |
| Edge | Supabase Edge Functions para automações |
| Idioma UI | Português (BR) |

Restrições adicionais:

- Segredos (keys, tokens) MUST NOT ser commitados; usar variáveis de ambiente.
- Dependências novas MUST ser justificadas no plano da feature (princípio de simplicidade).
- Conformidade LGPD: minimizar exposição de dados sensíveis na UI e em logs.

## Fluxo de Desenvolvimento

1. **Spec** (`/speckit-specify`) — o quê e por quê, sem detalhes de implementação.
2. **Plan** (`/speckit-plan`) — stack, Constitution Check, artefatos de design.
3. **Tasks** (`/speckit-tasks`) — tarefas por user story, caminhos de arquivo explícitos.
4. **Implement** (`/speckit-implement`) — código alinhado aos contratos e princípios acima.

Quality gates antes de merge:

- `npm run build` e `npm run lint` passando.
- Constitution Check do plano revisado (TypeScript, RLS, PT, performance, erros API).
- Fluxos críticos smoke-testados manualmente ou via testes quando existirem.
- Specs e planos vivem em `specs/`; agent context em `.cursor/rules/specify-rules.mdc`.

## Governance

Esta constitution supersede práticas ad hoc do projeto quando houver conflito.

**Emenda**: Propor mudança via `/speckit-constitution` com diff explícito; atualizar templates dependentes (plan, spec, tasks) na mesma entrega.

**Versionamento**:
- MAJOR: remoção ou redefinição incompatível de princípio.
- MINOR: novo princípio ou expansão material de gates.
- PATCH: clarificações sem mudar obrigações.

**Compliance**: Todo `/speckit-plan` MUST incluir seção Constitution Check mapeando estes cinco princípios. Violations MUST ser documentadas em Complexity Tracking com justificativa.

**Runtime guidance**: `.cursor/rules/specify-rules.mdc` e plano ativo em `specs/*/plan.md`.

**Version**: 1.0.0 | **Ratified**: 2026-05-26 | **Last Amended**: 2026-05-26

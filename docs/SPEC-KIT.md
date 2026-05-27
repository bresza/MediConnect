# Spec Kit no MediConnect

O [GitHub Spec Kit](https://github.com/github/spec-kit) já está configurado neste repositório para **desenvolvimento orientado a especificação** (Spec-Driven Development) no **Cursor**.

## O que foi instalado

| Pasta | Função |
|-------|--------|
| `.specify/` | Templates, scripts PowerShell, constitution, extensão git |
| `.cursor/skills/speckit-*` | Skills do Cursor (`/speckit-constitution`, `/speckit-specify`, etc.) |
| `specs/` | Especificações de features (criadas ao usar `/speckit-specify`) |

## Como usar no Cursor

> **Importante:** `/speckit-specify`, `/speckit-plan`, etc. **não são comandos do PowerShell**.
> Digite no **chat do Cursor** (Agent), não no terminal. No PowerShell aparece erro
> *"The term '/speckit-specify' is not recognized"*.

1. Abra o projeto **MediConnect** no Cursor.
2. Abra o **Chat do Agent** (`Ctrl+L` ou painel lateral).
3. Digite os comandos (skills) **uma linha por vez**:

| Comando | Quando usar |
|---------|-------------|
| `/speckit-constitution` | Definir princípios do projeto (qualidade, testes, UX) |
| `/speckit-specify` | Descrever **o quê** construir (sem stack ainda) |
| `/speckit-clarify` | (Opcional) Tirar dúvidas antes do plano |
| `/speckit-plan` | Plano técnico (React, Supabase, etc.) |
| `/speckit-tasks` | Lista de tarefas implementáveis |
| `/speckit-implement` | Executar as tarefas no código |

### Exemplo para o MediConnect

```
/speckit-constitution Foco em TypeScript estrito, RLS Supabase, UX em português, acessibilidade e testes de fluxos críticos.

/speckit-specify Automatizar confirmação de consulta por WhatsApp com respostas do paciente e lembretes 30/15/7/3 dias e 24h antes.

/speckit-plan Stack: Vite, React, Supabase Edge Functions, serviços em src/services.

/speckit-tasks

/speckit-implement
```

## Reinstalar ou atualizar (Windows)

Requer [uv](https://docs.astral.sh/uv/) (`winget install astral-sh.uv`).

```powershell
# Instalar CLI (uma vez)
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git

# Garantir PATH (nova janela de terminal ou):
$env:Path = "C:\Users\larad\.local\bin;$env:Path"
$env:PYTHONUTF8 = "1"

# Re-inicializar no projeto (cuidado: pode sobrescrever arquivos do spec-kit)
cd C:\Users\larad\MediConnect
specify init --here --force --integration cursor-agent --script ps --ignore-agent-tools
```

## Documentação oficial

- Repositório: https://github.com/github/spec-kit  
- Integrações: https://github.github.io/spec-kit/reference/integrations.html  

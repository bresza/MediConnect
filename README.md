# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
<<<<<<< Updated upstream
=======

## Contrato De Dados

O app usa IDs de banco como `string` para pacientes, equipe, agenda, prontuários, receitas e financeiro. Campos enviados ao Supabase seguem `snake_case`; o frontend converte para os modelos em `camelCase` nos arquivos em `src/services`.

Principais tabelas esperadas:

- `patients`: cadastro do paciente, incluindo `full_name`, `cpf`, `phone_mobile`, `birth_date`, `gender`, `status`, `address` e preferências de contato.
- `appointments`: agenda com `patient_id`, `doctor_id`, `scheduled_at`, `duration_minutes`, `status` e `notes`.
- `medical_records`: prontuários com `patient_id`, `doctor_id`, `record_date`, `chief_complaint`, histórico clínico, sinais vitais em `vital_signs`, diagnóstico e conduta.
- `prescriptions`: receitas com `patient_id`, `doctor_id`, `issued_at`, `prescription_type`, `medications` em JSON e status.
- `financial_records`: lançamentos financeiros com `patient_id`, `patient_name`, `value`, `discount`, `payment_method`, `due_date` e `status`.
- `reports`: laudos com `patient_id`, `exam`, `diagnosis`, `conclusion`, `content_html`, `cid_code` e `status`.
- `doctors` e `profiles`: equipe e nomes exibidos na agenda/prontuários.

## Observações

O diretório `backend/` não é usado pelo frontend atual. A integração ativa é feita pelos serviços em `src/services/*` usando Supabase REST e Edge Functions..
>>>>>>> Stashed changes

# TEK-DOK-MIND

Your Ultimate AI Agent for Technical Documentation.

## Getting Started

Install dependencies and configure local secrets:

```bash
npm ci
cp .env.example .env.local
openssl rand -base64 32
openssl rand -base64 32
```

Add the separately generated values to `GITHUB_TOKEN_ENCRYPTION_KEY_V1` and
`LLM_CONNECTOR_ENCRYPTION_KEY_V1` in `.env.local`. Keep both server-only keys
in the deployment platform’s secret manager and never commit them.

Apply the SQL files in `supabase/migrations/` to the Supabase project referenced
by `.env.local`, in filename order. They create the forced-RLS project, session,
and repository tables plus their restricted RPC functions.

Start the application:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

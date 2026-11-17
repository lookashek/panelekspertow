# Panel Ekspertów

Panel Ekspertów to aplikacja webowa, w której użytkownik opisuje decyzję lub problem (od błahego
zakupu do decyzji biznesowej), a panel person-doradców LLM debatuje nad nim z wymuszoną
rozbieżnością: runda pierwsza to izolowane, niezależne opinie każdego doradcy (ocena 1–10 przed
uzasadnieniem), runda druga pozwala zmienić ocenę tylko ze wskazaniem autora argumentu, który
przekonał, a sesję zamyka synteza z co najmniej jedną osią sporu. Cel: skrócić czas między
pojawieniem się pomysłu a wykryciem jego najpoważniejszej wady — zamiast dostawać kilka wariantów
tej samej, zgodnej opinii. Każdy użytkownik ma konto i widzi wyłącznie własne sesje (historia zapisana
per użytkownik).

Pełny opis problemu, person, kryteriów sukcesu i wymagań funkcjonalnych:
[`context/foundation/prd.md`](./context/foundation/prd.md). Decyzje dot. stacku technologicznego:
[`context/foundation/tech-stack.md`](./context/foundation/tech-stack.md). Reguły dla agentów/AI
pracujących w tym repo: [`CLAUDE.md`](./CLAUDE.md).

Zbudowana na bazie `10x-astro-starter` (patrz sekcje poniżej dla setupu, Supabase, deploymentu) —
scaffold frameworka/auth/Cloudflare pochodzi ze starter kitu, logika produktu (panel doradców,
rundy, synteza, historia sesji) jest własna.

## Tech Stack

- [Astro](https://astro.build/) v7 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v6 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone <this-repo-url>
cd panelekspertow
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run smoke` - Smoke test the auth flow against a running server (`BASE_URL`, defaults to `http://localhost:4321`)

## Project Structure

```md
.
├── src/
│ ├── layouts/           # Astro layouts
│ ├── pages/              # Astro pages (sessions, auth, dashboard)
│ │ └── api/              # API endpoints (auth, sessions CRUD, streaming)
│ ├── components/         # UI components (Astro & React)
│ ├── hooks/               # React hooks (panel/synthesis/side-thread streaming)
│ ├── lib/
│ │ ├── services/         # Use-case orchestration (SessionService)
│ │ ├── repositories/      # Supabase data access (SessionRepository)
│ │ ├── adapters/          # LLM provider adapters (OpenRouter, …)
│ │ ├── advisors/          # Advisor persona registry + panel/synthesis runners
│ │ ├── prompts/           # Versioned advisor/synthesis prompts
│ │ └── schemas/           # Zod schemas shared frontend/backend
│ ├── middleware.ts        # Auth resolution + protected-route redirects
│ └── assets/              # Static assets
├── context/
│ ├── foundation/          # PRD, tech-stack, roadmap, test-plan (10xDevs workflow)
│ └── changes/              # In-flight change docs
├── supabase/migrations/   # Forward-only SQL migrations, RLS per table
├── public/                 # Public assets
├── wrangler.jsonc          # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Database migrations

Migrations live in `supabase/migrations/` (`YYYYMMDDHHmmss_short_description.sql`, forward-only, never edited after apply). Apply them to your local stack:

```bash
npx supabase db reset       # fresh database + seed, runs every migration
# or
npx supabase migration up   # apply any migrations not yet applied
```

Every table enables Row Level Security with one policy per operation per role, so a user can only read/write their own rows. Prove the isolation holds (creates two throwaway users against your local Supabase and asserts cross-user access is denied on every operation):

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_KEY=<anon key from CLI output> npm run smoke:rls
```

Keep `.env` and `.dev.vars` in sync after pulling new migrations — Node/Supabase CLI reads `.env`, Cloudflare local dev reads `.dev.vars`. No secrets are committed by this script.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

## Smoke test

`scripts/smoke.mjs` is a dependency-free Node script that walks the whole auth flow (sign-up, sign-in, protected page, sign-out) over HTTP. Run it against the dev server or the production preview after dependency upgrades:

```bash
npm run dev            # or: npm run build && npm run preview
BASE_URL=http://localhost:4321 npm run smoke
```

It needs a reachable Supabase instance (local or cloud) with email confirmation disabled.

> **Note:** this script exists primarily to guard the development of the starter itself — it is a fast sanity check that dependency upgrades did not break the build, the Cloudflare adapter or the Supabase auth flow. It is **not** a substitute for a real test suite. Once you build your own product on top of this starter, add proper tests (unit, integration, end-to-end) suited to your application.

## CI

GitHub Actions runs two jobs on every push and PR to `master`:

- **ci** — lint, `astro check` and build. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step.
- **smoke** — starts a local Supabase via the Supabase CLI, builds, serves the production preview on the Cloudflare runtime and runs `npm run smoke` against it. No secrets required.

## License

MIT

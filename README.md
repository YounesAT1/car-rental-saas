# Car Rental SaaS

A multi-tenant operating system for independent rental agencies, with a customer storefront, agency workspace, and separate SaaS administration.

**Current status: Phase 1 foundation implemented. Phase 2 has not started.** See the [Phase 1 report](docs/phase-1.md) for scope, validation and setup limitations.

The homepage uses a [Mobbin-inspired navbar and text-only hero](docs/homepage-redesign.md): a floating pill navigation, centered typography, responsive layout, coordinated light/dark themes, and English, French, and Arabic translations with RTL support.

The application uses Next.js App Router, strict TypeScript, Tailwind CSS, selected shadcn primitives, Clerk and Convex. It includes a responsive public shell, light/dark/system theme, loading and recovery states. Business tables, account journeys, agency onboarding and dashboards arrive in later phases.

## Run locally

Use Node **24.20.0** and pnpm **11.25.0**, pinned in `.node-version` and `package.json`. With Corepack installed, `corepack pnpm --version` resolves the project pin without replacing a global package manager.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:3000](http://localhost:3000). In a second terminal, run `pnpm convex:dev` when editing backend functions. The development backend is already configured for this workspace; frontend-only work does not require the Convex watcher.

The ignored `.env.local` contains real development credentials. Preserve it and `.clerk/keyless.json` locally. On a fresh checkout, copy `.env.example` to `.env.local` and obtain keys through the intended service accounts or a secure channel. Blank placeholders deliberately fail configuration validation. Never paste secret keys into source or documentation.

## Development services

- **Convex:** project `younes-at:car-rental-saas`, development reference `younes-at:car-rental-saas:dev/foundation`, deployment `wary-labrador-920`. [Development dashboard](https://dashboard.convex.dev/t/younes-at/car-rental-saas/wary-labrador-920). No production deployment was created.
- **Clerk:** an accountless, claimable development application was created with the official CLI. Its keys work and issuer validation has passed against Convex. To attach it to your Clerk account, run `pnpm dlx clerk@3.3.0 auth login` from this workspace and complete the browser flow. This ownership step remains outstanding. Do not recreate the app or discard its local claim state. [Clerk CLI setup](https://clerk.com/docs/cli).

For another development environment, select the intended Convex development deployment with `pnpm exec convex dev` and configure these values:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key; public browser configuration |
| `CLERK_SECRET_KEY` | Clerk server key; never a `NEXT_PUBLIC_` value |
| `NEXT_PUBLIC_CONVEX_URL` | Convex client API URL ending in `.convex.cloud` |
| `CONVEX_DEPLOYMENT` | CLI selection written by Convex, currently `dev:wary-labrador-920` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | CLI-provided HTTP action origin; reserved, not consumed by the current UI |
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk Frontend API HTTPS issuer; required separately in Convex, and locally by the provider smoke script |

Set the issuer on the selected backend with `pnpm exec convex env set CLERK_JWT_ISSUER_DOMAIN https://YOUR_INSTANCE.clerk.accounts.dev`. This is a public issuer URL, not a secret key. The current unclaimed app uses a supported JWT template named `convex`, with claims `{ "aud": "convex" }`, a 60-second lifetime and 5-second clock skew. Convex's Clerk provider requests that template when the session lacks the `convex` audience. Once the app is claimed, the recommended Clerk Convex integration can configure the session audience directly; rerun the provider smoke check after changing it. See the [integration decision](docs/phase-1.md#provider-configuration).

## Validate

```sh
pnpm check
pnpm format:check
pnpm build
pnpm convex:check
pnpm smoke:providers
```

`check` runs frontend/backend type checks and ESLint with zero warnings allowed. `convex:check` generates types, validates and pushes functions to the selected **development** deployment; it is not a read-only command. `smoke:providers` requires development keys, creates one synthetic Clerk user/session, verifies a signed token and tampered-token rejection, then deletes that user in a `finally` block. It never writes business data. Keep this live smoke check out of production automation. If interrupted during the check, locate only users with the private metadata purpose `phase-1-provider-smoke` for cleanup.

For the production build locally, run `pnpm start` after `pnpm build`. Both frontend modes require access to Clerk. Use `localhost:3000` consistently. In restricted execution environments, Next.js worker spawning may require process permission and service CLIs require network access.

## Read the proposal

| Document | Purpose |
| --- | --- |
| [Architecture](docs/architecture.md) | Executive design, Convex assessment, data flows, state ownership, routes, folders, risks |
| [Product and domain model](docs/domain-model.md) | Actors, requirements, journeys, relationships, reservation and rental lifecycles, maintenance |
| [Database schema](docs/database-schema.md) | Phased Convex document proposal, field conventions, concrete indexes and access patterns |
| [Permissions](docs/permissions.md) | Tenant authorization, role grants, customer and platform boundaries |
| [Availability](docs/availability.md) | Atomic allocation protocol, holds, concurrency, buffers, overdue rentals, branch feasibility |
| [Pricing and finance](docs/finance.md) | Quotes, money, deposits, rental payments, invoices, analytics, SaaS billing |
| [Security](docs/security.md) | Threat model, uploads, private downloads, identities, webhooks, retention |
| [AI architecture](docs/ai-architecture.md) | Responses API, tenant-isolated retrieval, live tools, permissions, usage |
| [Dependencies](docs/dependencies.md) | Minimal dependency policy, official documentation review, phase-specific additions |
| [Testing](docs/testing.md) | Acceptance gates, isolation matrix, concurrency verification, UX checks |
| [Deployment](docs/deployment.md) | Future environments, secrets ownership, releases, backups, observability |
| [Roadmap](docs/roadmap.md) | Phases 0–19, adjusted dependencies, decisions and Phase 0 completion report |
| [Architecture decisions](docs/decisions/README.md) | Important tradeoffs and proposed ADRs |

The domain documents describe intended future behavior. The Phase 1 report distinguishes the implemented foundation from unimplemented tenancy, security, concurrency and business features.

## Working agreement

Each phase begins with inspection, scope, decisions, dependencies, risks, and an implementation plan. Implement that phase only, run its applicable checks, fix defects, update documentation, report results and the next phase, then stop.

The next phase is identity, tenancy and RBAC. It starts only after the explicit instruction **“Continue to Phase 2.”**

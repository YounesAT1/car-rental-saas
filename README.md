# Car Rental SaaS

A multi-tenant operating system for independent rental agencies, with a customer storefront, agency workspace, and separate SaaS administration.

**Current status: Phase 5 vehicle operations are complete on the development stack; the full Phase 2–5 live acceptance flow passed on 2026-09-21.** Open **Workspace → Operations** for readiness, maintenance, inspections and tasks, or **Workspace → Manage fleet** for vehicles, categories/features and photos. See the [Phase 5 report](docs/phase-5.md) and [workspace forms report](docs/phase-5-workspace-forms.md) for the delivered scope and validation evidence; the Phase 4 report covers fleet evidence.

Maintenance now links to **Service schedules**, where managers can create, edit,
archive and restore vehicle schedules. Select the services covered when planning
maintenance; completing that work establishes their next date/distance thresholds.
See the [schedule workspace report](docs/phase-5-schedules.md).

The homepage uses a [Mobbin-inspired navbar and text-only hero](docs/homepage-redesign.md): a floating pill navigation, centered typography, responsive layout, coordinated light/dark themes, and English, French, and Arabic translations with RTL support.

The application uses Next.js App Router, strict TypeScript, Tailwind CSS, shadcn UI components, Clerk and Convex. It includes a responsive public shell, light/dark theme, multilingual loading and recovery states, real Clerk auth routes, Convex identity synchronization, agency onboarding, invitations and a protected workspace.

Use the shared shadcn components under `src/components/ui` for app controls, including form inputs, selects, checkboxes, field groups, tables, disclosures and dialogs. Application confirmations use `useConfirm`; reload/close warnings remain browser-managed. See the [control migration report](docs/shadcn-controls.md) for coverage and validation.

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

| Variable                            | Purpose                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key; public browser configuration                                                      |
| `CLERK_SECRET_KEY`                  | Clerk server key; never a `NEXT_PUBLIC_` value                                                           |
| `NEXT_PUBLIC_CONVEX_URL`            | Convex client API URL ending in `.convex.cloud`                                                          |
| `CONVEX_DEPLOYMENT`                 | CLI selection written by Convex, currently `dev:wary-labrador-920`                                       |
| `NEXT_PUBLIC_CONVEX_SITE_URL`       | CLI-provided HTTP action origin used for authenticated private evidence upload/download                  |
| `CLERK_JWT_ISSUER_DOMAIN`           | Clerk Frontend API HTTPS issuer; required separately in Convex, and locally by the provider smoke script |
| `PRIVATE_FILE_ALLOWED_ORIGINS`      | Exact comma-separated web origins allowed to call authenticated private-file HTTP actions                |

Set the issuer on the selected backend with `pnpm exec convex env set CLERK_JWT_ISSUER_DOMAIN https://YOUR_INSTANCE.clerk.accounts.dev`. This is a public issuer URL, not a secret key. The current unclaimed app uses a supported JWT template named `convex`, with claims `{ "aud": "convex" }`, a 60-second lifetime and 5-second clock skew. Convex's Clerk provider requests that template when the session lacks the `convex` audience. Once the app is claimed, the recommended Clerk Convex integration can configure the session audience directly; rerun the provider smoke check after changing it. See the [integration decision](docs/phase-1.md#provider-configuration).

## Validate

```sh
pnpm check
pnpm format:check
pnpm i18n:check
pnpm test
pnpm build
pnpm convex:check
pnpm smoke:providers
```

`check` runs frontend/backend type checks and ESLint with zero warnings allowed. `convex:check` generates types, validates and pushes functions to the selected **development** deployment; it is not a read-only command. `smoke:providers` requires development keys, creates one synthetic Clerk user/session, verifies a signed token and tampered-token rejection, then deletes that user in a `finally` block. It never writes business data. Keep this live smoke check out of production automation. If interrupted during the check, locate only users with the private metadata purpose `phase-1-provider-smoke` for cleanup.

For the production build locally, run `pnpm start` after `pnpm build`. Both frontend modes require access to Clerk. Use `localhost:3000` consistently. Private-file HTTP actions on the current development deployment allow `http://localhost:3000,http://localhost:3002`. When changing this public allowlist in PowerShell, quote the comma-separated argument, for example `pnpm exec convex env set PRIVATE_FILE_ALLOWED_ORIGINS 'http://localhost:3000,http://localhost:3002'`, and read it back with `pnpm exec convex env get PRIVATE_FILE_ALLOWED_ORIGINS`. In restricted execution environments, Next.js worker spawning may require process permission and service CLIs require network access.

With the app running and the development backend updated, `pnpm smoke:phase5` runs the Phase 2–5 browser/domain flow (or use `pnpm smoke:phase4` for Phase 2–4). Set `PHASE2_BASE_URL` if using a port other than 3000. This creates disposable Clerk identities and agencies, verifies tenant isolation, settings, fleet records, photo processing, mileage, private evidence, maintenance/inspection/task permissions, themes and translations, then performs scoped cleanup. Screenshots and a cleanup manifest live under ignored `.tmp/phase2-<run-id>/`. It refuses production credentials and deployment-key overrides. If interrupted, use the exact manifest for cleanup; do not reset your database.

## Read the proposal

| Document                                           | Purpose                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [Architecture](docs/architecture.md)               | Executive design, Convex assessment, data flows, state ownership, routes, folders, risks      |
| [Product and domain model](docs/domain-model.md)   | Actors, requirements, journeys, relationships, reservation and rental lifecycles, maintenance |
| [Database schema](docs/database-schema.md)         | Phased Convex document proposal, field conventions, concrete indexes and access patterns      |
| [Permissions](docs/permissions.md)                 | Tenant authorization, role grants, customer and platform boundaries                           |
| [Availability](docs/availability.md)               | Atomic allocation protocol, holds, concurrency, buffers, overdue rentals, branch feasibility  |
| [Pricing and finance](docs/finance.md)             | Quotes, money, deposits, rental payments, invoices, analytics, SaaS billing                   |
| [Security](docs/security.md)                       | Threat model, uploads, private downloads, identities, webhooks, retention                     |
| [AI architecture](docs/ai-architecture.md)         | Responses API, tenant-isolated retrieval, live tools, permissions, usage                      |
| [Dependencies](docs/dependencies.md)               | Minimal dependency policy, official documentation review, phase-specific additions            |
| [Testing](docs/testing.md)                         | Acceptance gates, isolation matrix, concurrency verification, UX checks                       |
| [Deployment](docs/deployment.md)                   | Future environments, secrets ownership, releases, backups, observability                      |
| [Phase 2 report](docs/phase-2.md)                  | Implemented identity, tenancy, RBAC, onboarding and workspace evidence                        |
| [Phase 3 report](docs/phase-3.md)                  | Agency settings, branches/hours, versioned policies and validation evidence                   |
| [Phase 4 report](docs/phase-4.md)                  | Fleet, catalogs, validated photo uploads, permissions and validation evidence                 |
| [Phase 5 report](docs/phase-5.md)                  | Vehicle operations, private evidence, readiness, inspections, damage and task foundations     |
| [Roadmap](docs/roadmap.md)                         | Phases 0–19, adjusted dependencies, decisions and Phase 0 completion report                   |
| [Architecture decisions](docs/decisions/README.md) | Important tradeoffs and proposed ADRs                                                         |

The domain documents describe intended future behavior. The phase reports distinguish the implemented features from later business modules, operational workflows and production hardening. The local `docs` directory is currently ignored by Git.

## Working agreement

Each phase begins with inspection, scope, decisions, dependencies, risks, and an implementation plan. Implement that phase only, run its applicable checks, fix defects, update documentation, report results and the next phase, then stop.

The next planned phase is **Phase 6 — Customers**. It has not started and requires its own inspection, plan and explicit continuation under the phase protocol.

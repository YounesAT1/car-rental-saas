# Project working guidance

- Use the installed skills under `.agents/skills` when they apply. The user explicitly requested these as the project workflow.
- For visual design, use `brainstorming`, `ui-ux-pro-max`, and `frontend-design`. Honor a design already approved in the conversation; do not ask again for the same approval. Prefer deliberate typography, spacing, and product-specific imagery over generic decoration.
- For Clerk work, start with the `clerk` router and follow the matching framework/CLI skill.
- For Convex work, start with the `convex` router; consult `convex-expert` before editing backend functions or schemas. Preserve the project's application-owned membership model instead of introducing Clerk Organizations as a second source of truth.
- Work within the current approved phase. The approved Automotive Studio homepage redesign does not start Phase 2.
- Preserve local credentials and user-added skills/configuration. Never print keys or claim tokens, and never commit them.
- Use exact pinned dependencies and pnpm. Run type generation/checks and production builds sequentially because they share `.next` output.
- Keep Server Components as the default. Validate responsive layouts, both themes, keyboard navigation and real link destinations for UI changes.

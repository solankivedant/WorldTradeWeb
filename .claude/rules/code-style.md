# Rule: Code style

## TypeScript

- `strict: true`. No `any` — use `unknown` and narrow. If a third-party type is wrong, write
  a local declaration rather than casting through `any`.
- Named exports only, except Next.js pages/layouts where the framework requires default.
- Zod schemas at every boundary (API input, external data, env vars). Derive TS types from
  the schema with `z.infer` — never maintain both by hand.
- Server Components by default. Add `"use client"` only when the component needs state,
  effects, or browser APIs, and push it as far down the tree as possible.
- Money and trade values are `number` in USD units, never strings, never formatted at rest.
  Formatting happens at render time only.

## Python

- Ruff for lint and format. Type hints on every public function.
- Pydantic v2 models for anything crossing a service boundary.
- Polars over pandas for pipeline work. Use lazy frames (`scan_parquet`, not `read_parquet`)
  so predicates push down.
- No bare `except`. Catch the specific error or let it propagate.

## Naming

- Country identifiers are ISO 3166-1 alpha-3 (`IND`, `VNM`) everywhere internally. Convert at
  the display edge only. Variables holding them are named `*_iso`, never `country` alone.
- Product codes are strings, never integers — leading zeros are significant (`0901` is
  coffee; `901` is nothing).
- Trade direction is the literal union `"export" | "import"`, never a boolean.
- Year is an integer, never a string or a Date.

## Components

- One component per file, named to match the file.
- Data fetching lives in `src/lib/api/`, not inside components.
- Every chart component accepts a `data` prop and renders no fetch of its own — this keeps
  them testable and Storybook-able.

## Comments

Comment the *why*, never the *what*. The concordance logic, the mirror-flow handling, and the
opportunity weights need comments explaining the reasoning. `// increment counter` does not.

## Commits

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `data:`. Use `data:`
for changes to pipelines or published datasets — those need a different review eye than code.

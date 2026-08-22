# ADR 0001 — Record architecture decisions

**Status:** Accepted
**Date:** 2026-08-22

## Context

`docs/TECH_STACK.md` records the current technology choices and the reasoning behind them.
That document describes the present state. It does not preserve *why* a choice changed, and a
choice reversed without a written reason tends to get reversed back six months later by
someone who cannot see the argument.

## Decision

Architecture decisions are recorded as numbered ADRs in this directory.

Write one whenever a decision recorded in `docs/TECH_STACK.md` is reversed, or when a choice
is made that a future reader would reasonably question. Update `TECH_STACK.md` to reflect the
new state, and link the ADR from it.

Format: Context, Decision, Consequences. Short is fine — a page is plenty. Status is one of
Proposed, Accepted, Superseded (by ADR NNNN).

Do not write an ADR for routine choices with an obvious answer. The bar is: would a competent
newcomer look at this and ask "why on earth did they do it that way?"

## Consequences

- One more small step when reversing a stack decision.
- The reasoning behind the codebase survives the people who made it.
- `TECH_STACK.md` stays a description of the present, not an archaeology layer.

## Candidates already visible

These are decisions likely to need an ADR when revisited:

- Collapsing the FastAPI analytics service into Next.js if it stays thin (TECH_STACK §3).
- Moving off DuckDB if the trade cube passes ~200M rows or concurrency outgrows one node
  (TECH_STACK §4).
- Introducing ML into the opportunity engine, which V1 explicitly rules out (DESIGN §10).
- Resolving the company-data question in PRD §10, which materially changes scope.

import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");

/**
 * @type {import('next').NextConfig}
 *
 * File tracing.
 *
 * `lib/data.ts` reads the published dataset off disk at request time, from a directory
 * OUTSIDE this app (the repo root). Both keys below exist to make sure those files reach
 * a serverless function.
 *
 *   outputFileTracingRoot     - states the monorepo root explicitly instead of letting
 *                               Next infer it. Next currently infers the same directory,
 *                               so this changes nothing today; it is here so that adding
 *                               a lockfile or a sibling package later cannot silently
 *                               move the root and drop everything above apps/web.
 *
 *   outputFileTracingIncludes - names the data files outright. Measured: the tracer
 *                               already finds them unaided, because @vercel/nft can
 *                               evaluate `path.resolve(process.cwd(), "../../data/
 *                               processed")` and then globs the directory when the
 *                               filename handed to readFileSync is a variable. That is a
 *                               heuristic, not a contract - it holds only while the
 *                               directory stays statically evaluable, which the planned
 *                               DuckDB swap could easily end. The app renders nothing
 *                               without these files and fails silently when they are
 *                               missing, so the explicit include is cheap insurance.
 *
 * Neither key caused the empty production deploy, and neither key fixes it. That was
 * `.gitignore`: `data/processed/**` was ignored, so a clean clone - which is exactly what
 * a Vercel build starts from - had nothing to trace. See the note there.
 *
 * `/**` covers every route rather than listing them: the root layout builds the header's
 * country index, so no route in this app is free of the dataset.
 */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["deck.gl", "@deck.gl/react", "@deck.gl/layers", "@deck.gl/core", "@deck.gl/mapbox"],

  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/**": ["data/processed/*.json"],
  },
};

export default nextConfig;

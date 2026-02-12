# OpenInterviewer

## Stack
- Next.js 14 App Router, TypeScript, Tailwind CSS (stone palette), Framer Motion
- `@upstash/redis` for KV storage (not `@vercel/kv` — supports dynamic client URLs)
- `jose` for JWT signing/verification, `arctic` v3 for OAuth
- `bun` for package management (see global CLAUDE.md)

## Architecture
- Dual deployment: `DEPLOYMENT_MODE=standalone` (self-deploy) or `hosted` (multi-tenant BYOS)
- `src/lib/mode.ts` — `isStandaloneMode()` / `isHostedMode()` helpers
- `src/lib/researcherContext.ts` — central per-request context resolution
  - `getRequestContext()` for admin/researcher routes
  - `getParticipantRequestContext(request)` for participant routes
- All KV functions in `src/lib/kv.ts` accept optional `client?: Redis` parameter
- `src/lib/kvClient.ts` — dynamic Redis client factory with LRU cache; exports `isValidUpstashUrl()` for SSRF prevention
- `src/lib/platformDb.ts` — platform DB for researcher accounts (hosted mode only); supports `PLATFORM_KEY_PREFIX` env var for staging/prod isolation
- AI providers: in hosted mode, pass `''` to prevent env var fallback; `undefined` allows it
- `src/lib/crypto.ts` — AES-256-GCM encryption for credentials at rest

## Gotchas
- TypeScript target does NOT support `downlevelIteration` — cannot spread `Map.entries()` or use `for...of` on Maps. Use `forEach` instead.
- Two JWT token types (session + participant) share fallback secret (`ADMIN_PASSWORD`). Always check `payload.type` to prevent token-type confusion.
- `null ?? getKVClient()` calls `getKVClient()` because `??` coalesces null. This matters in the KV client resolution pattern.
- Standalone mode must work with zero hosted-mode env vars. Guard hosted-only code paths with `isHostedMode()`.
- User-provided URLs used server-side must be validated (SSRF). Only `https://*.upstash.io` allowed for Redis.
- Security-sensitive checks (e.g., "links disabled") should fail closed — deny on error, not allow.
- Gemini API key validation uses `x-goog-api-key` header, not query string (avoids log leakage).

## Testing
- `bun run build` is the primary verification — catches type errors and route issues
- No test suite yet; verification is manual (standalone + hosted mode flows)

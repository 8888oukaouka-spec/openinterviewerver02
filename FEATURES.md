# OpenInterviewer — Feature Inventory

> **Purpose:** Baseline checklist for weekly code reviews. Update this file whenever a feature is added, changed, or removed. Use the checklist during reviews to verify all areas still function correctly.
>
> **Last updated:** 2026-10-02 (after upstream commits 1–7: jose bump, StudySetup fieldset, tolerant sessionStorage, participant link security, per-study AI provider commitment)

---

## 1. Authentication & Session Management

### 1.1 Researcher Authentication
- **OAuth login** via Google and GitHub (`src/app/api/auth/oauth/{google,github}/`)
- **Session tokens** (JWT, issuer `openinterviewer`, audience `openinterviewer:researcher`) created server-side; stored as `session` cookie (`src/lib/auth.ts`)
- **`/api/auth`** — sign-out (DELETE) and session check (GET via `/api/auth/me`)
- **Login page** (`src/components/Login.tsx`, `src/components/OAuthLogin.tsx`) — shown if no valid session
- **OAuth rate limiting** (`src/lib/oauthRateLimit.ts`) — protects `/api/auth/oauth/*/callback`
- **Sign-in limits** — IPv6 /64 subnet keying for rate limit bucketing

### 1.2 Participant Authentication
- **Participant session tokens** (JWT, audience `openinterviewer:participant-session`) created when a participant follows a link (`src/lib/auth.ts:createParticipantSessionToken`)
- **Participant cookie** (`participant-session` + per-session handle suffix) and header (`x-openinterviewer-participant-session`) accepted on all participant API routes
- **Participant token verification** (`verifyParticipantToken`) checks expiry, audience, study binding

### 1.3 Onboarding (First-Run Setup)
- **4-step wizard** (`src/components/Onboarding.tsx`): Welcome → AI Keys → Redis → Done
- **AI key validation** (`/api/onboarding/validate-ai-key`) — live round-trip test for Gemini, Claude, OpenAI, OpenRouter keys
- **Redis validation** (`/api/onboarding/validate-redis`) — live connection test for Upstash Redis URL
- **Save credentials** (`/api/onboarding/save-credentials`) — stores secrets in environment/KV
- **Complete onboarding** (`/api/onboarding/complete`) — marks instance as configured
- **Readiness check** (`/api/config/readiness`) — `GET` returns whether all required config is present

---

## 2. Researcher Dashboard & Projects

### 2.1 Project Organization
- **Projects** are top-level containers; studies are nested inside projects (`src/components/Dashboard.tsx`, `StudyList.tsx`)
- **Create project** — POST `/api/projects`
- **Rename / delete project** — PATCH / DELETE `/api/projects/[id]`
- **List studies in project** — GET `/api/projects/[id]/studies`
- **Export project** — GET `/api/projects/[id]/export` (Markdown ZIP of all studies + interviews)
- **Accordion UI** — projects collapse/expand; study cards listed inside (`StudyList.tsx`)
- **Move study to project** — via study update (PATCH `/api/studies/[id]`)

### 2.2 Study Listing
- **Study cards** show name, interview count, link status, parent project
- **Pending study stubs** (`PendingStudyStub` type) — placeholder shown while a new study is being created
- **Owned-studies reconciliation** (`/api/studies/reconcile`) — repairs orphaned studies

---

## 3. Study Setup & Configuration

### 3.1 Study Draft Form (`src/components/StudySetup.tsx`, `src/components/studySetup/useStudyDraft.ts`)
All fields set `isDirty = true`; form is `<fieldset disabled={isSaving}>` during save.

**Core study fields:**
- Study name (max 200 chars)
- Description (max 10,000 chars)
- Research question (max 4,000 chars)
- Core interview questions — ordered list, add/remove/reorder (max 50 × 2,000 chars each)
- Topic areas — freeform list used by the AI for follow-up scoping (max 50 × 500 chars each)

**Participant profile schema:**
- Add custom profile fields with label + extraction hint + optional/required toggle
- Predefined field presets available
- Options list per field (for select-type fields, max 20 × 500 chars)
- Field IDs: alphanumeric + dash/underscore, unique within study

**Consent & participant-facing text:**
- Consent text (max 20,000 chars) — rendered verbatim on consent page
- Researcher contact (max 200 chars) — shown on consent page
- Thank-you screen text (max 4,000 chars) — shown after interview completes

**AI configuration:**
- **Provider selection**: Gemini, Claude, OpenAI, OpenRouter (`AIProviderType`)
- **Model selection**: per-provider model list (`PROVIDER_MODELS` from `src/lib/providerRegistry.ts`)
- **AI behavior / interviewing style** (`AIBehavior`): `structured`, `standard`, `exploratory`
- **Interviewer manner / instructions** (max 4,000 chars) — freeform or preset templates (neutral, warm, formal, plain language, concrete incidents) (`src/lib/interviewerManner.ts`)
- **Gemini reasoning** (`enableReasoning: boolean`) — Gemini-only toggle for extended thinking
- **AI provider commitment** (`ProviderCommitment: 'fixed' | 'may-change'`) — controls what participants are told about whether the AI provider may change (`src/lib/providerCommitment.ts`)

**Participant link settings:**
- **Link expiration**: `never`, `7days`, `30days`, `90days`
- **Links enabled/disabled** toggle — disables all existing links without revoking them

### 3.2 Study Config Validation (`src/lib/studyConfigValidation.ts`)
- Strict allowlist of top-level and nested fields — unknown fields are rejected
- Server-owned fields (`id`, `createdAt`) cannot be overridden by client
- Placeholder text in `consentText` and `thankYouText` blocks save
- Bounded limits on all string and array fields
- Model validation against known provider/model pairs (`isKnownProviderModel`)
- `aiProviderCommitment` validated with `isProviderCommitment`

### 3.3 Study Lineage (Follow-Up Studies)
- Studies generated from synthesis carry `parentStudyId`, `parentStudyName`, `generatedFrom: 'synthesis'`
- Manual copies carry `generatedFrom: 'manual'`
- UI shows parent study reference in study setup

### 3.4 Study CRUD API
- **Create** — POST `/api/studies` (validates config, assigns server-owned `id` + `createdAt`, advances `revision`)
- **Read** — GET `/api/studies/[id]`
- **Update** — PATCH `/api/studies/[id]` (merges patch over canonical state, re-validates)
- **Delete** — DELETE `/api/studies/[id]` (only if zero interviews)
- **Force delete** — POST `/api/studies/[id]/force-delete` (admin override, deletes with interviews)
- **Export study** — GET `/api/studies/[id]/export` (Markdown ZIP)
- **Reconcile** — POST `/api/studies/reconcile` (repair orphaned studies)

---

## 4. Participant Links

### 4.1 Link Generation & Management
- **Generate link** — POST `/api/generate-link` — creates a signed, cryptographically unique link code; stores `ParticipantLinkRecord` in Redis
- **List links** — GET `/api/studies/[id]/participant-links`
- **Revoke link** — DELETE `/api/studies/[id]/participant-links` (disables specific link; past interviews still stored)
- **Link expiration** — enforced server-side; expired links return 403
- **Link code format** — `LINK_VALUE_PREFIX = 'oi:link:'` prefixed; SHA-256 digested for storage (`src/lib/participantLinks.ts`)

### 4.2 Secure Link Handover (RT-10)
- **Route rewrite** — Next.js rewrites `/p/:code` → `/p?code=` so the link code never appears in the client router state or `document.referrer` (`next.config.js`)
- **`Referrer-Policy: no-referrer`** header on `/p/:code*` responses
- **`src/app/p/page.tsx`** — static client route; reads link code from `window.location.pathname` via `participantLinkCode()` (`src/lib/participantLinkPath.ts`)
- **`participantLinkHandover.ts`** — `sessionSurvivesDocumentLoad()` checks stored Zustand version; `leaveLinkPage()` does document navigation if session survives, client router otherwise
- **`tolerantSessionStorage`** — Zustand persist middleware wrapper that catches `sessionStorage` quota/disabled errors (`src/lib/tolerantSessionStorage.ts`); store key `research-tool-storage`, version `6`
- **`NoSessionNotice`** — hydration-safe "This interview is not open in this tab" component using `useSyncExternalStore` (`src/components/NoSessionNotice.tsx`)

### 4.3 Link Exchange & Session Creation
- **`beginParticipantSession()`** — called from `/p` page; exchanges link code for a signed participant JWT; stores session handle in `sessionStorage`
- **Transport detection** — `participantTransport()` returns `'direct' | 'gateway'` from the link record
- **`KNOWN_TRANSPORTS`** — `Set(['direct', 'gateway'])` (Cloudflare gateway not supported in this fork)

---

## 5. Participant Interview Flow

### 5.1 Consent Page (`src/components/Consent.tsx`)
- Shows study name and consent text verbatim
- **Interview structure overview**: background questions → N core questions → AI follow-ups → feedback question
- **Data notice**: specifies AI provider and transport (direct / Vercel AI Gateway / OpenRouter)
- **Provider commitment notice**: appended to data notice:
  - `fixed`: names exact provider + model; states no switching
  - `may-change`: informs participant analysis may use different provider
  - OpenRouter special case: discloses ZDR-compatible upstream routing
- **Guard**: consent button disabled if AI provider not configured; `<Disclosure role="alert">` shown
- **Consent recording** — POST `/api/consent`; server stores `ParticipantConsentRecord` in Redis; returns server-issued `acceptedAt` timestamp
- **Back** button available in researcher/preview mode only (not participant mode)

### 5.2 Profile Collection (Background Questions)
- Profile fields from `studyConfig.profileSchema` are presented before the core interview
- AI extracts field values from participant answers during or after the profile phase
- Extracted fields stored in `ParticipantProfile` (with `rawContext` and per-field `ProfileFieldValue`)

### 5.3 Interview Chat (`src/components/InterviewChat.tsx`)
- **AI greeting** — POST `/api/greeting` generates opening message using study config
- **Turn-based conversation** — POST `/api/interview` for each AI response
- **Interview phases**: `ProfileCollection` → `Interview` → `Synthesis` (tracked via `InterviewPhase`)
- **Question progress tracking** — `QuestionProgress` per core question (`asked`, `answered`, `skipped`)
- **`BehaviorData`** — records phase, turn count, question progress per turn for provenance
- **Speech recognition** (Web Speech API):
  - 14 supported languages: English (US), Spanish, French, German, Portuguese (BR), Chinese, Japanese, Korean, Italian, Dutch, Swedish, Arabic, Hindi, Russian
  - Auto-selects language from `navigator.language`
  - Continuous mode with interim results displayed while speaking
  - Gemini-style pill UI with language selector dropdown
  - Error handling: network, language support, generic — user-visible messages with browser suggestions
- **Preview mode** — researcher can run full interview using `preview` headers; result not persisted to dataset
- **Rate limits** (participant session): greeting 3/session/10min, interview 60/session/hr

### 5.4 Synthesis (`src/components/Synthesis.tsx`)
- Generated after all core questions answered — POST `/api/synthesis`
- **`SynthesisResult`**: themes (with evidence refs), key quotes, notable patterns, researcher implications, follow-up suggestions
- **Synthesis receipt** — JWT signed by server; contains hash of transcript + profile + behavior data; used to bind the synthesis to a specific interview submission
- **Rate limit**: synthesis 2/session/day

### 5.5 Interview Save (`src/app/api/interviews/save/route.ts`)
- **Idempotent** — exact retries are no-ops; conflicting reuse of same `id` with different content → 409
- **Consent verification** — server re-verifies participant consent record before saving
- **Receipt verification** — synthesis receipt validated; expired or invalid receipt → 403
- **Fingerprint** — SHA-256 of canonical interview content; used for idempotency and conflict detection
- **Server-controlled fields**: `id`, `completedAt`, `status`, `conductedByProvider`, `conductedByModel`, `studyRevision`, `consentHash`, `consentAcceptedAt`
- **`providerCommitment`** saved from study config into interview record
- **`conductedWithInstructions`** — saved if study has custom interviewer instructions
- **Persist guard** — two-phase write with persisting lock key
- **Revision pinning** — interview is rejected if study was updated after the session started
- **Rate limit**: save 2/session/day
- **Researcher preview** — validated but not written to dataset

### 5.6 Thank-You Screen
- Shown after interview saved successfully
- Displays `studyConfig.thankYouText` (with default fallback if not configured)
- Default fallback text set at render time (not frozen into record) — improving default improves all studies

---

## 6. Research Data & Synthesis

### 6.1 Study Detail View (`src/components/StudyDetail.tsx`)
- **Interview list** — shows all completed interviews for the study
- **Aggregate synthesis** — POST `/api/synthesis/aggregate` — cross-interview theme analysis
- **Tabs**: Interviews, Links, Settings, Export
- **Force delete** button for studies with interviews (admin override)

### 6.2 Interview Detail (`src/components/InterviewDetail.tsx`)
- Full transcript view
- Synthesis themes, evidence refs, key quotes
- Participant profile display
- Behavior data (phase transitions, question progress)

### 6.3 Export (`src/components/Export.tsx`)
- **Study export** — GET `/api/studies/[id]/export` — ZIP containing Markdown per interview + summary
- **Project export** — GET `/api/projects/[id]/export` — ZIP containing all studies
- **Interviews export** — GET `/api/interviews/export` — CSV of all interview metadata
- **`buildStudyMarkdown`** / **`buildProjectMarkdown`** / **`slugify`** (`src/lib/exportMarkdown.ts`)
- **CSV utilities** — formula neutralization + proper escaping (`src/lib/csv.ts`)

### 6.4 Interview List API
- **GET `/api/interviews`** — list all interviews (researcher-scoped)
- **GET `/api/interviews/[id]`** — single interview fetch
- **DELETE `/api/interviews/[id]`** — delete interview

### 6.5 Aggregate Synthesis
- **POST `/api/synthesis/aggregate`** — synthesizes across multiple interview syntheses for a study
- Returns `AggregateSynthesisResult` with `AggregateTheme[]` (cross-participant pattern analysis)

---

## 7. AI Provider System

### 7.1 Supported Providers & Models (`src/types.ts`, `src/lib/providerRegistry.ts`)
| Provider | Default Interview Model | Synthesis Model |
|----------|------------------------|-----------------|
| Gemini | `gemini-3.7-flash` | `gemini-2.5-flash` |
| Claude | `claude-sonnet-5` | `claude-opus-5` |
| OpenAI | `gpt-5.6-terra` | `gpt-5.6-sol` |
| OpenRouter | `openai/gpt-5.6-terra` | `openai/gpt-5.6-sol` |

### 7.2 AI Transport Modes
- **`direct`** — calls provider API directly with researcher's credentials
- **`gateway`** — routes through Vercel AI Gateway (disclosed to participant as "Vercel AI Gateway")
- Transport stored in participant link record; checked at session creation

### 7.3 Credential Management (`src/components/Settings.tsx`)
- **GET/POST `/api/account/credentials`** — view/update Gemini, Claude, OpenAI, OpenRouter API keys
- **Live credential validation** (`src/lib/credentialValidation.ts`) — tests key with real API round-trip
- **Account management** — GET/DELETE `/api/account`
- **Account reconcile-deletion** — POST `/api/account/reconcile-deletion`

### 7.4 Provider Commitment (`src/lib/providerCommitment.ts`)
- `ProviderCommitment = 'fixed' | 'may-change'`
- `DEFAULT_PROVIDER_COMMITMENT = 'fixed'`
- `isProviderCommitment(value)` — type guard
- `commitmentCovers(record, provider, model)` — checks whether a provider/model call is allowed under a fixed commitment
- `researcherProviderNotDisclosedResponse()` — returns 409 `PROVIDER_NOT_DISCLOSED` when commitment is violated (`src/lib/providerCommitmentResponse.ts`)

### 7.5 AI Behavior Modes (`AIBehavior`)
- `structured` — follows questions closely, minimal follow-ups
- `standard` — balanced follow-ups
- `exploratory` — deep follow-ups, high latitude

### 7.6 Interviewer Manner Presets (`src/lib/interviewerManner.ts`)
Editable starting points stored as ordinary researcher instructions (not preset IDs):
1. Neutral / default
2. Warm and empathetic
3. Formal and professional
4. Plain language (accessible)
5. Concrete incidents (STAR-method prompting)

---

## 8. Participant Rate Limits (`src/lib/rateLimit.ts`)

| Operation | Limit |
|-----------|-------|
| Greeting | 3 per session per 10 minutes |
| Interview turn | 60 per session per hour |
| Synthesis | 2 per session per day |
| Save (persist) | 2 per session per day |

Rate limits are keyed by participant session ID + link ID + researcher ID combination. Redis Lua scripts enforce atomic counter updates.

---

## 9. Data Storage (`src/lib/kv.ts`)

### 9.1 Redis Data Model (Upstash)
- **Studies** — stored by study ID; include config + revision + link metadata
- **Projects** — stored by project ID; include study membership
- **Interviews** — stored by `session-{participantSessionId}`; immutable after creation
- **Participant links** — stored as link records with expiration, revocation status, session binding
- **Participant consent records** — stored per session × study × revision
- **Interview persisting guard** — temporary lock during two-phase write
- **Analysis state** — per-interview async analysis status

### 9.2 Researcher Account (Platform DB)
- Researcher accounts stored in platform DB (separate from per-researcher Redis)
- `ResearcherAccount` — id, email, OAuth provider, created/updated timestamps
- `ResearcherProfile` — display name, avatar

---

## 10. Deployment Modes

### 10.1 Hosted Mode
- OAuth sign-in via Google / GitHub
- Per-researcher isolated Upstash Redis instances
- AI credentials per researcher
- Config validated by `validateHostedConfig` (`src/lib/hostedConfig.ts`)

### 10.2 Standalone / Self-Hosted Mode
- Single researcher instance
- Direct Redis connection
- Config validated by `validateStandaloneConfig`
- `/api/config/mode` returns deployment mode
- `/api/config/status` returns configuration health

### 10.3 Demo Mode
- **POST `/api/demo/seed`** — seeds Redis with sample study + interviews for demonstration
- `DemoSimulation` component (`src/components/DemoSimulation.tsx`)

---

## 11. Security

### 11.1 Input Validation
- All API request bodies size-bounded (`readBoundedJsonObject`, `readBoundedJsonObject`) — max 128 KB for study mutations, 512 KB for interview saves
- All string fields length-bounded (see `studyConfigValidation.ts` constants)
- Allowlist validation on all JSON objects — unknown fields rejected
- Study config allowlist: 21 known fields (see `STUDY_CONFIG_FIELDS`)
- Profile field allowlist: 5 known fields

### 11.2 Authorization
- **Researcher routes** — require valid session JWT
- **Participant routes** — require valid participant JWT bound to specific study + link
- **Study ownership** — all study operations scoped to authenticated researcher
- **`resolveParticipantOrPreviewContext`** — unified auth resolution for participant + researcher-preview flows
- **`loadCanonicalStudy`** — validates study exists and is owned by the authenticated researcher

### 11.3 Data Integrity
- Interview fingerprinting (SHA-256) prevents tampering with saved data
- Synthesis receipt (JWT) binds synthesis to specific transcript + profile + behavior data
- Study revision pinning — interviews rejected if study config changed mid-session
- Participant consent re-verified server-side before saving interview
- Server-controlled timestamps — `completedAt` always server-generated; `createdAt` accepted only if plausible (past, within 30 days)
- Formula injection neutralization in CSV exports

### 11.4 Privacy
- Referrer-Policy: no-referrer on participant link pages
- Link code never in client router state (route rewrite pattern)
- `tolerantSessionStorage` — fails gracefully if storage is disabled/quota exceeded

### 11.5 Rate Limiting
- Participant operations rate-limited by composite session + link + researcher key
- OAuth callback rate-limited (`src/lib/oauthRateLimit.ts`)

---

## 12. Infrastructure & Config

### 12.1 Key Config Files
- `next.config.js` — route rewrites (`/p/:code` → `/p?code=`), Referrer-Policy header
- `src/store.ts` — Zustand store with `tolerantSessionStorage`, key `research-tool-storage` version `6`
- `src/lib/hostedConfig.ts` / `validateStandaloneConfig` — environment validation

### 12.2 Health & Readiness
- **GET `/api/health/ready`** — liveness check
- **GET `/api/config/readiness`** — checks all required env vars and storage connectivity

### 12.3 Request Logging
- `createRequestId` / `logRequestFailure` (`src/lib/requestLog.ts`) — structured failure logging on 5xx responses

---

## 13. UI System

### 13.1 UI Components (`src/components/ui/`)
- `Button` — primary / quiet variants
- `Disclosure` — collapsible section with alert role support
- `Label` — accessible form label
- `Verbatim` — renders text preserving whitespace/newlines
- `PreviewBanner` — shown when researcher is in preview mode

### 13.2 Application Routing (Next.js App Router)
| Path | Component | Auth |
|------|-----------|------|
| `/` | `Landing` | none |
| `/login` | `Login` / `OAuthLogin` | unauthenticated |
| `/dashboard` | `Dashboard` → `StudyList` | researcher |
| `/setup` | `StudySetup` | researcher |
| `/consent` | `Consent` | participant / researcher preview |
| `/interview` | `InterviewChat` | participant / researcher preview |
| `/synthesis` | `Synthesis` | participant |
| `/export` | `Export` | researcher |
| `/settings` | `Settings` | researcher |
| `/onboarding` | `Onboarding` | first-run |
| `/p/:code` | → rewrite → `/p?code=` | none (link handover) |
| `/p` | Participant link page (`src/app/p/page.tsx`) | none |

---

## Weekly Code Review Checklist

When reviewing each week, verify these areas against the inventory above:

- [ ] **Auth** — session token validation, OAuth flows, sign-out, participant token lifecycle
- [ ] **Participant link security** — referrer policy, route rewrite, `tolerantSessionStorage`, `NoSessionNotice`
- [ ] **Study setup** — all form fields save/load correctly; validation errors surface; dirty state tracks correctly
- [ ] **Provider commitment** — consent page data notice matches `aiProviderCommitment`; commitment saved into interview record
- [ ] **Interview flow** — greeting → profile → interview → synthesis → save; phase transitions correct
- [ ] **Speech recognition** — 14 languages selectable; errors shown to user; works in Chrome
- [ ] **Rate limits** — per-operation counters correct; retry-after headers present on 429s
- [ ] **Export** — Markdown ZIP and CSV downloads work; formulas neutralized in CSV
- [ ] **Data integrity** — fingerprint, synthesis receipt, revision pinning, consent re-verification
- [ ] **Input validation** — unknown fields rejected; size limits enforced; placeholder text blocked
- [ ] **Aggregate synthesis** — cross-interview analysis produces `AggregateTheme[]`
- [ ] **Follow-up study generation** — parent study lineage fields correct
- [ ] **TypeScript build** — `next build` passes with zero type errors
- [ ] **New features** — update this file for any feature added or changed during the week

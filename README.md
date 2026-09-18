# Atende — Voice Agents for Portuguese SMEs

**Atende** is a subscription SaaS: a **voice booking agent** with its own **+351**
number that answers calls, books appointments into the business calendar, and
warm-transfers to the right person when needed. Beachhead: **barbearias / salões**
(then clinics), PT-first.

> This repository implements the **Voice Agents** product from the Transformative
> productization strategy. "Atende" is a working brand placeholder.

## What it does

- **PT-first landing page** with barber/clinic positioning and pricing.
- **Thin backoffice** (not a full PMS): onboarding, resources (barbers),
  services/durations/prices, opening hours, Cal.com connect, number provisioning,
  billing, and the **Disponível / A cortar** warm-transfer toggle. **Agenda** can
  connect a person's Google Calendar (OAuth) and sync it with the backoffice calendar.
- **Conversational agent** (PT/EN) that understands natural language
  (_"marcar corte + barba quinta às 16h"_), fills missing details, checks
  availability and books — available as a **web/voice demo** and via a
  **voice-orchestrator function webhook** (Grok Live 2 / Retell / Vapi).
- **Cal.com** remains an optional scheduling brain. **Google Calendar** can also
  be connected directly from Agenda onto a person/account (email + OAuth tokens
  persisted in Postgres). There is **no username/password login** in v1: onboard
  stores business + contact email; Entrar is slug-only.
- **Telnyx (primary) / Zadarma (fallback)** number provisioning, plus inbound-call
  **TeXML** and warm transfer.
- **Stripe subscriptions** where the plan price **includes the monthly DID cost**
  (+ included minutes; optional metered overage).

Every integration is **optional**: with no keys the app runs a self-contained
demo (in-memory scheduler, mock number provider) so it is always deployable.

## Architecture

```
Caller ──▶ DID (+351, Telnyx/Zadarma) ──SIP──▶ voice stack (Grok/Retell/Vapi)
                                                     │  function webhook
                                                     ▼
                          /voice/functions/:slug  →  Scheduler (Cal.com ⇄ Google)
                                                     ▲
Web demo ──▶ Grok Live 2 WS (ephemeral token) ── tool calls ──▶ /realtime/tool
```

| Layer | Path |
| --- | --- |
| Config + feature flags | `src/config.ts` |
| Domain (business, service, resource, plan) | `src/domain/` |
| Store (Postgres or JSON persistence) | `src/store/` |
| Scheduling (Cal.com + in-memory) | `src/scheduling/` |
| Conversational agent (PT/EN) | `src/agent/` |
| Billing (Stripe) | `src/billing/` |
| Telephony (Telnyx/Zadarma/mock, voice webhooks) | `src/telephony/` |
| HTTP server + routes | `src/server.ts` |
| Landing / backoffice / demo UIs | `public/` |

## Run locally

```bash
npm ci
npm run dev            # http://localhost:3000
```

- Landing: `/`
- Backoffice: `/app/:slug` (demo tenants: `clinica-central` on the homepage, `barbearia-lisboa` still at `/demo`)
- Voice demo: homepage card at `/` (**Grok Live 2** speech-to-speech). `/demo/:slug` remains as a URL.

Copy `.env.example` and fill only the integrations you want to activate.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Dev server with hot reload (`tsx`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint |
| `npm test` | Vitest suite |

## Key HTTP endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health + active feature flags |
| GET | `/api/plans` | Plan catalog + setup fee |
| POST | `/api/onboard` | Create a business |
| GET/PUT | `/api/business/:slug` | Read / update config |
| POST | `/api/business/:slug/number` | Provision a +351 number |
| POST | `/api/business/:slug/resource/:rid/toggle` | Disponível / A cortar |
| POST | `/api/business/:slug/message` | Talk to the agent (text NLU fallback) |
| POST | `/api/business/:slug/realtime/session` | Mint a Grok Live 2 ephemeral token for the demo |
| POST | `/api/business/:slug/realtime/tool` | Execute a Grok function tool against the business |
| GET | `/api/business/:slug/google/connect` | Start Google OAuth (returns `{ url }`) |
| GET | `/api/google/oauth/callback` | Google OAuth redirect; tokens saved on the person |
| POST | `/api/business/:slug/google/sync` | Pull Google events + push local bookings |
| POST | `/api/business/:slug/google/disconnect` | Drop Google tokens for that person |
| POST | `/voice/incoming` | Demo DID inbound TeXML (`Connect/Stream` or `Dial Sip`) |
| POST | `/voice/incoming/:slug` | Inbound-call TeXML |
| WS | `/voice/live-media` | Telnyx TeXML Stream ↔ gpt-live-1 media bridge |
| POST | `/voice/openai-live` | OpenAI Direct SIP `live.transport.incoming` accept |
| POST | `/voice/functions/:slug` | Voice-LLM function calls (`get_slots`, `book_appointment`, …) |
| POST | `/webhooks/stripe` | Stripe subscription webhooks |

## Deploy on Railway

The repo is Railway-ready (`Dockerfile` + `railway.json`, healthcheck at
`/api/health`, `PORT` respected).

```bash
# One-time
railway login                 # or set RAILWAY_TOKEN in the environment
railway init                  # create/link a project
railway up                    # build & deploy the Dockerfile

# Recommended: attach a volume mounted at /data for booking persistence,
# and set PUBLIC_BASE_URL to the deployed URL.
railway variables set PUBLIC_BASE_URL=https://<your-app>.up.railway.app
```

Set integration variables (see `.env.example`) in the Railway service to light
up Cal.com, Stripe, and Telnyx/Zadarma. Without them the service still boots and
serves the demo.

**Demo DID (`+351210210260`) — required for Live from the first second:**

| Variable | Role |
| --- | --- |
| `PUBLIC_BASE_URL` | Public HTTPS origin. TeXML Stream uses `wss://$PUBLIC_BASE_URL/voice/live-media`. |
| `OPENAI_API_KEY` | Bridges Telnyx PCMU media to `gpt-live-1` (one picker session; simulated booking in speech, no booking tools). |
| `OPENAI_LIVE_SIP_URI` | Optional. When set, inbound TeXML `Dial`s this SIP URI instead of Stream. |
| `OPENAI_LIVE_BACKEND_MODEL` | Delegated Responses model (default `gpt-5.6-terra`). |

Do not emit a Stream URL unless this service is serving `/voice/live-media` (this
repo does). A GET without `Upgrade: websocket` returns **426**; Telnyx must
WebSocket-upgrade the path.

### Persistence

- **Postgres (recommended, production):** add the Railway **Postgres** plugin and
  the service picks up `DATABASE_URL` automatically. On boot the app creates its
  tables (`businesses`, `bookings`, `accounts`, `oauth_states`) and loads/saves
  there. Set `DATABASE_SSL=true` if you use Postgres' public proxy URL (the
  internal `*.railway.internal` URL does not need it).
  `accounts` holds the person under a business (onboard `contactEmail`, Google
  OAuth access/refresh tokens, calendar sync state). `oauth_states` holds the
  Google OAuth CSRF state so it is not memory-only.
- **JSON file (dev/demo only):** with no `DATABASE_URL`, data is stored in
  `DATA_DIR/db.json`. On Railway the container filesystem is ephemeral, so mount a
  **Volume** at `/data` (the Dockerfile sets `DATA_DIR=/data`) to persist it.

The store keeps data in memory for fast synchronous reads and persists through the
selected backend (`src/store/persistence.ts`).

### Auth (intentionally not a login product)

There is **still no password login**. Onboard persists business fields
(`contactEmail`, `contactPhone`, hours, services, …) plus a **person/account**
row under that business. Entrar is **slug-only**. Google Calendar OAuth attaches
to that person (email + tokens + sync state). Do not expect a username/password
screen in this version.

## Status / next steps

- Live implementation is wired for Cal.com, Stripe and Telnyx and gated behind
  credentials; Zadarma number purchase is typically completed in its panel.
- Production voice (PSTN) needs a provisioned DID + SIP pointed at the voice
  stack; the function webhook is ready for the orchestrator to call.
- Auth/multi-tenant login for the backoffice is intentionally minimal in v1
  (slug-only Entrar; person/account stores email + Google tokens, no password).

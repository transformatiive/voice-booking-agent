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
  billing, and the **Disponível / A cortar** warm-transfer toggle.
- **Conversational agent** (PT/EN) that understands natural language
  (_"marcar corte + barba quinta às 16h"_), fills missing details, checks
  availability and books — available as a **web/voice demo** and via a
  **voice-orchestrator function webhook** (Grok Live 2 / Retell / Vapi).
- **Cal.com** as the scheduling brain, with **Google Calendar** sync configured
  inside Cal.com (the barber's backoffice is the Google Calendar app on their phone).
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
Web/voice demo ──▶ /api/business/:slug/message ──── ConversationManager
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
- Backoffice: `/app/:slug` (a demo `barbearia-lisboa` is seeded)
- Voice demo: `/demo/:slug`

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
| POST | `/api/business/:slug/message` | Talk to the agent |
| POST | `/api/business/:slug/checkout` \| `/portal` | Stripe checkout / portal |
| POST | `/voice/incoming/:slug` | Inbound-call TeXML |
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

### Persistence

- **Postgres (recommended, production):** add the Railway **Postgres** plugin and
  the service picks up `DATABASE_URL` automatically. On boot the app creates its
  tables (`businesses`, `bookings`) and loads/saves there. Set `DATABASE_SSL=true`
  if you use Postgres' public proxy URL (the internal `*.railway.internal` URL
  does not need it).
- **JSON file (dev/demo only):** with no `DATABASE_URL`, data is stored in
  `DATA_DIR/db.json`. On Railway the container filesystem is ephemeral, so mount a
  **Volume** at `/data` (the Dockerfile sets `DATA_DIR=/data`) to persist it.

The store keeps data in memory for fast synchronous reads and persists through the
selected backend (`src/store/persistence.ts`).

## Status / next steps

- Live implementation is wired for Cal.com, Stripe and Telnyx and gated behind
  credentials; Zadarma number purchase is typically completed in its panel.
- Production voice (PSTN) needs a provisioned DID + SIP pointed at the voice
  stack; the function webhook is ready for the orchestrator to call.
- Auth/multi-tenant login for the backoffice is intentionally minimal in v1.

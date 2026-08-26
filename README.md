# voice-booking-agent

A conversational **voice/chat booking assistant**. Talk (or type) to the agent to
schedule appointments — it understands natural language like _"Book a haircut
tomorrow at 3pm"_, checks availability against business hours and existing
appointments, fills in missing details through follow-up questions, and confirms
the booking end to end.

The project is fully self-contained: no external API keys or paid services are
required to run it. Natural-language understanding is rule-based plus
[`chrono-node`](https://github.com/wanasit/chrono) for date/time parsing, and
bookings are stored in memory (optionally persisted to a JSON file).

## Features

- Natural-language intent + entity parsing (service, date/time, customer name).
- Slot-filling dialogue: the agent asks for whatever detail is missing.
- Availability engine: business hours (Mon–Sat, 9am–5pm), per-service durations,
  conflict detection, and open-slot suggestions.
- REST API + a modern web UI with **voice input** (Web Speech API) and spoken
  replies (speech synthesis) where the browser supports them.

## Tech stack

- Node.js + TypeScript (ESM)
- Express (HTTP API + static frontend)
- chrono-node (natural-language dates)
- Vitest (tests), ESLint + `tsc` (lint/typecheck)

## Getting started

```bash
npm ci          # install dependencies
npm run dev     # start the dev server on http://localhost:3000
```

Then open http://localhost:3000 and start booking.

## Scripts

| Script              | Description                                    |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Start the dev server with hot reload (`tsx`).  |
| `npm run build`     | Compile TypeScript to `dist/`.                 |
| `npm start`         | Run the compiled server from `dist/`.          |
| `npm run typecheck` | Type-check without emitting.                   |
| `npm run lint`      | Lint with ESLint.                              |
| `npm test`          | Run the Vitest suite.                          |

## API

| Method | Endpoint        | Body                       | Description                          |
| ------ | --------------- | -------------------------- | ------------------------------------ |
| GET    | `/api/health`   | –                          | Health check.                        |
| GET    | `/api/services` | –                          | List bookable services.              |
| GET    | `/api/bookings` | –                          | List current bookings.               |
| POST   | `/api/message`  | `{ sessionId, text }`      | Send a message to the agent.         |
| POST   | `/api/reset`    | `{ sessionId }`            | Reset a conversation session.        |

### Example

```bash
curl -s localhost:3000/api/message \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"demo","text":"Book a haircut tomorrow at 3pm for Alice"}'
```

## Configuration

| Env var         | Default              | Description                                  |
| --------------- | -------------------- | -------------------------------------------- |
| `PORT`          | `3000`               | HTTP port.                                   |
| `BOOKINGS_FILE` | `./data/bookings.json` | JSON file used to persist bookings on disk. |

## Project layout

```
src/
  server.ts            Express server (API + static frontend)
  types.ts             Shared types
  agent/
    nlu.ts             Intent + entity parsing
    conversation.ts    Slot-filling dialogue manager
  booking/
    catalog.ts         Services, business hours
    store.ts           Booking store (memory + JSON persistence)
    availability.ts    Availability + slot suggestions
public/                Web UI (HTML/CSS/JS, voice via Web Speech API)
tests/                 Vitest unit tests
```

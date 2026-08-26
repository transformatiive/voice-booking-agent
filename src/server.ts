import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import type { Request, Response } from "express";
import { BookingStore } from "./booking/store.js";
import { SERVICES } from "./booking/catalog.js";
import { ConversationManager } from "./agent/conversation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// public/ sits next to src/ in the repo and next to dist/ after a build.
const publicDir = join(__dirname, "..", "public");

const dataFile = process.env.BOOKINGS_FILE ?? join(process.cwd(), "data", "bookings.json");
const store = new BookingStore(dataFile);
const agent = new ConversationManager(store);

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/api/services", (_req: Request, res: Response) => {
  res.json(SERVICES);
});

app.get("/api/bookings", (_req: Request, res: Response) => {
  res.json(store.list());
});

app.post("/api/message", (req: Request, res: Response) => {
  const { sessionId, text } = req.body ?? {};
  if (typeof sessionId !== "string" || typeof text !== "string" || text.trim() === "") {
    res.status(400).json({ error: "sessionId and non-empty text are required" });
    return;
  }
  const result = agent.handle(sessionId, text);
  res.json(result);
});

app.post("/api/reset", (req: Request, res: Response) => {
  const { sessionId } = req.body ?? {};
  if (typeof sessionId !== "string") {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  agent.reset(sessionId);
  res.json({ status: "reset" });
});

const port = Number(process.env.PORT ?? 3000);
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  app.listen(port, () => {
    console.log(`voice-booking-agent listening on http://localhost:${port}`);
  });
}

export { app, store, agent };

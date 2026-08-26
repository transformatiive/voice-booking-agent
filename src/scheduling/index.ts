import { config } from "../config.js";
import type { Store } from "../store/store.js";
import { CalComScheduler } from "./calcom.js";
import { InMemoryScheduler } from "./inMemoryScheduler.js";
import type { Scheduler } from "./scheduler.js";

export function createScheduler(store: Store, now: () => Date = () => new Date()): Scheduler {
  if (config.scheduling.calApiKey) {
    return new CalComScheduler(
      store,
      { apiBase: config.scheduling.calApiBase, apiKey: config.scheduling.calApiKey },
      now,
    );
  }
  return new InMemoryScheduler(store, now);
}

export type { Scheduler } from "./scheduler.js";

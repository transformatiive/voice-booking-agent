import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store/store.js";
import type { Business } from "../src/domain/types.js";

export function tempStore(): Store {
  return new Store(mkdtempSync(join(tmpdir(), "atende-test-")));
}

export function serviceId(business: Business, nameIncludes: string): string {
  const service = business.services.find((s) =>
    s.name.toLowerCase().includes(nameIncludes.toLowerCase()),
  );
  if (!service) {
    throw new Error(`No service matching ${nameIncludes}`);
  }
  return service.id;
}

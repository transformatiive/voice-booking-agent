import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pgPkg from "pg";
import { config } from "../config.js";
import type { Booking, Business, Call, OAuthState, PersonAccount } from "../domain/types.js";

const { Pool } = pgPkg;
type PgPool = InstanceType<typeof Pool>;

export interface Db {
  businesses: Business[];
  bookings: Booking[];
  calls: Call[];
  accounts: PersonAccount[];
  oauthStates: OAuthState[];
}

export function emptyDb(): Db {
  return { businesses: [], bookings: [], calls: [], accounts: [], oauthStates: [] };
}

function coerceDb(parsed: Partial<Db> | null | undefined): Db {
  return {
    businesses: parsed?.businesses ?? [],
    bookings: parsed?.bookings ?? [],
    calls: parsed?.calls ?? [],
    accounts: parsed?.accounts ?? [],
    oauthStates: parsed?.oauthStates ?? [],
  };
}

/**
 * Persistence backend for the Store. The Store keeps the data in memory (so
 * reads stay synchronous everywhere) and delegates durable load/save here.
 *
 * - `loadSync` is used by synchronous backends (file) at construction time.
 * - `init`/`load` are used by asynchronous backends (Postgres) via Store.init().
 * - `persist` writes the full current snapshot; the Store serializes calls.
 */
export interface Persistence {
  readonly kind: "file" | "postgres";
  loadSync?(): Db | null;
  init?(): Promise<void>;
  load?(): Promise<Db>;
  persist(db: Db): Promise<void>;
}

/** JSON-file persistence for local development and demos. */
export class FilePersistence implements Persistence {
  readonly kind = "file" as const;
  private readonly file: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, "db.json");
  }

  loadSync(): Db | null {
    if (!existsSync(this.file)) {
      return null;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8")) as Partial<Db>;
      return coerceDb(parsed);
    } catch {
      return null;
    }
  }

  async persist(db: Db): Promise<void> {
    writeFileSync(this.file, JSON.stringify(db, null, 2), "utf8");
  }
}

/**
 * Postgres persistence (e.g. Railway Postgres). Data is stored in JSONB
 * tables; the full snapshot is rewritten within a transaction on each save.
 *
 * Tables: businesses, bookings, calls, accounts (person + Google OAuth tokens),
 * oauth_states (CSRF state for Google connect — not memory-only).
 */
export class PostgresPersistence implements Persistence {
  readonly kind = "postgres" as const;
  private readonly pool: PgPool;

  constructor(connectionString: string, ssl: boolean) {
    const useSsl = ssl || /[?&]sslmode=require/.test(connectionString);
    this.pool = new Pool({
      connectionString,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE,
        data JSONB NOT NULL
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        data JSONB NOT NULL
      );
    `);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS bookings_business_idx ON bookings (business_id);`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        data JSONB NOT NULL
      );
    `);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS calls_business_idx ON calls (business_id);`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        data JSONB NOT NULL
      );
    `);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS accounts_business_idx ON accounts (business_id);`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_states (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL
      );
    `);
  }

  async load(): Promise<Db> {
    const [businesses, bookings, calls, accounts, oauthStates] = await Promise.all([
      this.pool.query<{ data: Business }>("SELECT data FROM businesses"),
      this.pool.query<{ data: Booking }>("SELECT data FROM bookings"),
      this.pool.query<{ data: Call }>("SELECT data FROM calls"),
      this.pool.query<{ data: PersonAccount }>("SELECT data FROM accounts"),
      this.pool.query<{ data: OAuthState }>("SELECT data FROM oauth_states"),
    ]);
    return {
      businesses: businesses.rows.map((r) => r.data),
      bookings: bookings.rows.map((r) => r.data),
      calls: calls.rows.map((r) => r.data),
      accounts: accounts.rows.map((r) => r.data),
      oauthStates: oauthStates.rows.map((r) => r.data),
    };
  }

  async persist(db: Db): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM businesses");
      await client.query("DELETE FROM bookings");
      await client.query("DELETE FROM calls");
      await client.query("DELETE FROM accounts");
      await client.query("DELETE FROM oauth_states");
      for (const b of db.businesses) {
        await client.query("INSERT INTO businesses (id, slug, data) VALUES ($1, $2, $3)", [b.id, b.slug, b]);
      }
      for (const bk of db.bookings) {
        await client.query("INSERT INTO bookings (id, business_id, data) VALUES ($1, $2, $3)", [bk.id, bk.businessId, bk]);
      }
      for (const call of db.calls ?? []) {
        await client.query("INSERT INTO calls (id, business_id, data) VALUES ($1, $2, $3)", [call.id, call.businessId, call]);
      }
      for (const account of db.accounts ?? []) {
        await client.query("INSERT INTO accounts (id, business_id, data) VALUES ($1, $2, $3)", [
          account.id,
          account.businessId,
          account,
        ]);
      }
      for (const state of db.oauthStates ?? []) {
        await client.query("INSERT INTO oauth_states (id, data) VALUES ($1, $2)", [state.id, state]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

export function createPersistence(): Persistence {
  if (config.database.url) {
    return new PostgresPersistence(config.database.url, config.database.ssl);
  }
  return new FilePersistence(config.dataDir);
}

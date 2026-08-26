import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pgPkg from "pg";
import { config } from "../config.js";
import type { Booking, Business } from "../domain/types.js";

const { Pool } = pgPkg;
type PgPool = InstanceType<typeof Pool>;

export interface Db {
  businesses: Business[];
  bookings: Booking[];
}

export function emptyDb(): Db {
  return { businesses: [], bookings: [] };
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
      return { businesses: parsed.businesses ?? [], bookings: parsed.bookings ?? [] };
    } catch {
      return null;
    }
  }

  async persist(db: Db): Promise<void> {
    writeFileSync(this.file, JSON.stringify(db, null, 2), "utf8");
  }
}

/**
 * Postgres persistence (e.g. Railway Postgres). Data is stored in two JSONB
 * tables; the full snapshot is rewritten within a transaction on each save.
 * Write volume for this product is low and the dataset is small, so this is
 * simple and correct; it can later be optimized to targeted upserts.
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
  }

  async load(): Promise<Db> {
    const [businesses, bookings] = await Promise.all([
      this.pool.query<{ data: Business }>("SELECT data FROM businesses"),
      this.pool.query<{ data: Booking }>("SELECT data FROM bookings"),
    ]);
    return {
      businesses: businesses.rows.map((r) => r.data),
      bookings: bookings.rows.map((r) => r.data),
    };
  }

  async persist(db: Db): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM businesses");
      await client.query("DELETE FROM bookings");
      for (const b of db.businesses) {
        await client.query("INSERT INTO businesses (id, slug, data) VALUES ($1, $2, $3)", [b.id, b.slug, b]);
      }
      for (const bk of db.bookings) {
        await client.query("INSERT INTO bookings (id, business_id, data) VALUES ($1, $2, $3)", [bk.id, bk.businessId, bk]);
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

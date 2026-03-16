import { Pool } from "pg";

export async function runMigrations(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE owners ADD COLUMN IF NOT EXISTS invitation_code TEXT UNIQUE;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id VARCHAR PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        linked_owner_id VARCHAR NOT NULL,
        linked_subscriber_id VARCHAR,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        owner_id VARCHAR NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id VARCHAR NOT NULL,
        user_type TEXT NOT NULL,
        method_type TEXT NOT NULL,
        details TEXT NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        owner_id VARCHAR NOT NULL,
        amount NUMERIC NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        transaction_id VARCHAR,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    await client.query(`
      UPDATE owners SET invitation_code = UPPER(SUBSTRING(MD5(id) FROM 1 FOR 6))
      WHERE invitation_code IS NULL;
    `);

    console.log("Migrations completed successfully");
  } catch (e) {
    console.error("Migration error:", e);
  } finally {
    client.release();
  }
}

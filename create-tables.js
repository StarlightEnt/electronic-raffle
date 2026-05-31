/**
 * Electronic Raffle — Database Initialization
 * Run once: node create-tables.js
 */

const { Pool } = require('pg');

// Load env — try .env.local first, then process.env
try { require('dotenv').config({ path: '.env.local' }); } catch(e) {}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function createTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      -- ── Tournament Settings ─────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS tournament_settings (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'My Raffle Tournament',
        year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
        location TEXT,
        date_start TEXT,
        date_end TEXT,
        logo_url TEXT,
        primary_color TEXT DEFAULT '#f59e0b',
        digit_mode INTEGER DEFAULT 6 CHECK (digit_mode IN (6, 7)),
        sales_open BOOLEAN DEFAULT false,
        draw_active BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── Pack Tiers (configurable denominations) ──────────────────────
      CREATE TABLE IF NOT EXISTS pack_tiers (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournament_settings(id) ON DELETE CASCADE,
        name TEXT NOT NULL,           -- e.g. '120 Tickets'
        ticket_count INTEGER NOT NULL CHECK (ticket_count % 6 = 0),
        price NUMERIC(10,2) NOT NULL,
        pack_quantity INTEGER NOT NULL DEFAULT 50,  -- how many packs to pre-generate
        sort_order INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── Color Prefix Assignments (generated per tournament) ──────────
      CREATE TABLE IF NOT EXISTS color_prefixes (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournament_settings(id) ON DELETE CASCADE,
        tier_id INTEGER REFERENCES pack_tiers(id) ON DELETE CASCADE,
        color TEXT NOT NULL,          -- Red, Orange, Yellow, Green, Blue, Purple
        seed INTEGER NOT NULL,        -- 2-digit random seed (1-99)
        prefix TEXT NOT NULL,         -- e.g. '390'
        start_number INTEGER NOT NULL,-- e.g. 390001
        UNIQUE(tournament_id, tier_id, color)
      );

      -- ── Pack Inventory ───────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS packs (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournament_settings(id) ON DELETE CASCADE,
        tier_id INTEGER REFERENCES pack_tiers(id) ON DELETE CASCADE,
        serial TEXT NOT NULL UNIQUE,  -- e.g. '030 1001'
        pack_index INTEGER NOT NULL,  -- 0-based index within tier for range calc
        color_ranges JSONB NOT NULL,  -- { Red: {start, end}, Orange: {start, end}, ... }
        sold BOOLEAN DEFAULT false,
        buyer_name TEXT,
        buyer_pid TEXT,               -- SFGGC PID if registered bowler
        buyer_email TEXT,
        buyer_phone TEXT,
        sale_source TEXT DEFAULT 'pos', -- 'preregistration', 'pos', 'import'
        sold_at TIMESTAMPTZ,
        card_emailed BOOLEAN DEFAULT false,
        card_emailed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── Buyers (roster + walk-ups) ───────────────────────────────────
      CREATE TABLE IF NOT EXISTS buyers (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournament_settings(id) ON DELETE CASCADE,
        pid TEXT,                     -- SFGGC PID (nullable for non-bowlers)
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        source TEXT DEFAULT 'manual', -- 'import', 'manual'
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── Prize Inventory ──────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS prizes (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournament_settings(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        prize_type TEXT NOT NULL DEFAULT 'cash',
          -- 'cash', 'free_entry', 'bowling_ball', 'donated', 'other'
        value_display TEXT,           -- e.g. '$50', 'Free Entry Certificate'
        description TEXT,
        donor TEXT,                   -- for donated items
        session_label TEXT DEFAULT 'Tournament', -- 'Tournament', 'Awards Ceremony', or custom
        sequence_order INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',-- 'pending', 'drawn', 'skipped'
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── Draw Records ────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS draws (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournament_settings(id) ON DELETE CASCADE,
        prize_id INTEGER REFERENCES prizes(id) ON DELETE SET NULL,
        prize_name TEXT NOT NULL,     -- snapshot at draw time
        ticket_number INTEGER NOT NULL,
        ticket_color TEXT NOT NULL,
        pack_serial TEXT NOT NULL,
        buyer_name TEXT NOT NULL,
        buyer_pid TEXT,
        total_in_pool INTEGER NOT NULL,
        attempt_number INTEGER DEFAULT 1, -- for re-draws on same prize
        claimed BOOLEAN DEFAULT false,
        drawn_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ── Discarded Numbers (permanent — never re-drawable) ────────────
      CREATE TABLE IF NOT EXISTS discarded_numbers (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournament_settings(id) ON DELETE CASCADE,
        ticket_number INTEGER NOT NULL,
        ticket_color TEXT NOT NULL,
        discarded_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(tournament_id, ticket_number, ticket_color)
      );

      -- ── Import Log ───────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS import_log (
        id SERIAL PRIMARY KEY,
        tournament_id INTEGER REFERENCES tournament_settings(id) ON DELETE CASCADE,
        filename TEXT,
        imported_count INTEGER DEFAULT 0,
        skipped_count INTEGER DEFAULT 0,
        pre_buys_assigned INTEGER DEFAULT 0,
        imported_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_packs_tournament ON packs(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_packs_sold ON packs(tournament_id, sold);
      CREATE INDEX IF NOT EXISTS idx_draws_tournament ON draws(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_discarded_tournament ON discarded_numbers(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_prizes_tournament_order ON prizes(tournament_id, sequence_order);
      CREATE INDEX IF NOT EXISTS idx_buyers_tournament ON buyers(tournament_id);
      CREATE INDEX IF NOT EXISTS idx_buyers_pid ON buyers(pid);
    `);

    await client.query('COMMIT');
    console.log('✅ All tables created successfully');

    // Insert default tournament if none exists
    const { rows } = await client.query('SELECT id FROM tournament_settings LIMIT 1');
    if (rows.length === 0) {
      const { rows: [t] } = await client.query(`
        INSERT INTO tournament_settings (name, year, primary_color, digit_mode)
        VALUES ('My Raffle Tournament', EXTRACT(YEAR FROM NOW()), '#f59e0b', 6)
        RETURNING id
      `);
      console.log(`✅ Default tournament created (id=${t.id})`);

      // Insert default pack tiers
      await client.query(`
        INSERT INTO pack_tiers (tournament_id, name, ticket_count, price, pack_quantity, sort_order)
        VALUES
          ($1, '30 Tickets',  30,  5.00,  30, 1),
          ($1, '120 Tickets', 120, 20.00, 75, 2),
          ($1, '300 Tickets', 300, 50.00, 25, 3),
          ($1, '750 Tickets', 750, 100.00, 15, 4)
      `, [t.id]);
      console.log('✅ Default pack tiers created');
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating tables:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

createTables().catch(err => {
  console.error(err);
  process.exit(1);
});

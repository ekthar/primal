#!/usr/bin/env node
// Seed a demo tenant: admin + reviewer + club manager + sample tournament + clubs.
// Safe to re-run: uses ON CONFLICT DO NOTHING.

const { pool, query, transaction } = require('../db');
const { hashPassword } = require('../security');
const { logger } = require('../logger');

async function run() {
  const pw = await hashPassword('demo1234');

  await transaction(async (c) => {
    await c.query(
      `INSERT INTO users (id, email, password_hash, role, name, email_verified)
       VALUES
         ('00000000-0000-0000-0000-000000000001','mei@tournamentos.io',$1,'admin','Mei Tanaka',TRUE),
         ('00000000-0000-0000-0000-000000000002','luca@tournamentos.io',$1,'reviewer','Luca Moretti',TRUE),
         ('00000000-0000-0000-0000-000000000003','ops@sakuragym.jp',$1,'club','Sakura Ops',TRUE),
         ('00000000-0000-0000-0000-000000000004','diego.ruiz@mail.com',$1,'applicant','Diego Ruiz',TRUE)
       ON CONFLICT (email) DO NOTHING;`,
      [pw]
    );

    await c.query(
      `INSERT INTO clubs (id, name, slug, city, country, status, primary_user_id)
       VALUES
         ('10000000-0000-0000-0000-000000000001','Sakura Gym','sakura-gym','Tokyo','JP','active','00000000-0000-0000-0000-000000000003'),
         ('10000000-0000-0000-0000-000000000002','Apex Combat Club','apex-combat','Montreal','CA','active',NULL),
         ('10000000-0000-0000-0000-000000000003','Legion MMA','legion-mma','São Paulo','BR','active',NULL)
       ON CONFLICT (slug) DO NOTHING;`
    );

    await c.query(
      `INSERT INTO club_members (club_id, user_id, role)
       VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','manager')
       ON CONFLICT DO NOTHING;`
    );

    await c.query(
      `INSERT INTO tournaments (id, slug, name, season, starts_on, ends_on, registration_open_at, registration_close_at, is_public)
       VALUES ('20000000-0000-0000-0000-000000000001','season-2026','Season 2026 Championship','2026','2026-05-01','2026-05-30', NOW() - INTERVAL '30 days', NOW() + INTERVAL '30 days', TRUE)
       ON CONFLICT (slug) DO NOTHING;`
    );

    await c.query(
      `INSERT INTO profiles (id, user_id, club_id, first_name, last_name, discipline, weight_kg, weight_class)
       VALUES ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','Diego','Ruiz','MMA — Full Contact',77.2,'Welterweight')
       ON CONFLICT (user_id) DO NOTHING;`
    );
  });

  logger.info('Seed complete. Demo credentials: any-email / demo1234');
}

run()
  .catch((err) => { logger.error({ err }, 'Seed failed'); process.exit(1); })
  .finally(() => pool.end());

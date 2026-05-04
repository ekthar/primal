#!/usr/bin/env node
// Seed a demo tenant: admin + reviewer + club manager + sample tournament + clubs.
// Safe to re-run: uses ON CONFLICT DO NOTHING.

require('dotenv').config();

const { pool, transaction } = require('../db');
const { hashPassword } = require('../security');
const { logger } = require('../logger');

async function run() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@primalfight.io';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';
  const adminName = process.env.ADMIN_NAME || 'Primal Admin';
  const seedPassword = process.env.SEED_PASSWORD || 'demo1234';
  const adminPasswordHash = await hashPassword(adminPassword);
  const seedPasswordHash = await hashPassword(seedPassword);

  await transaction(async (client) => {
    await client.query(
      `INSERT INTO users (id, email, password_hash, role, name, email_verified)
       VALUES
         ('00000000-0000-0000-0000-000000000001',$1,$2,'admin',$3,TRUE),
         ('00000000-0000-0000-0000-000000000002','luca@primalfight.io',$4,'reviewer','Luca Moretti',TRUE),
         ('00000000-0000-0000-0000-000000000003','ops@sakuragym.jp',$4,'club','Sakura Ops',TRUE),
         ('00000000-0000-0000-0000-000000000004','diego.ruiz@mail.com',$4,'applicant','Diego Ruiz',TRUE)
       ON CONFLICT (email) DO NOTHING;`,
      [adminEmail, adminPasswordHash, adminName, seedPasswordHash]
    );

    await client.query(
      `INSERT INTO clubs (id, name, slug, city, country, status, primary_user_id)
       VALUES
         ('10000000-0000-0000-0000-000000000001','Sakura Gym','sakura-gym','Tokyo','JP','active','00000000-0000-0000-0000-000000000003'),
         ('10000000-0000-0000-0000-000000000002','Apex Combat Club','apex-combat','Montreal','CA','active',NULL),
         ('10000000-0000-0000-0000-000000000003','Legion MMA','legion-mma','Sao Paulo','BR','active',NULL)
       ON CONFLICT (slug) DO NOTHING;`
    );

    await client.query(
      `INSERT INTO club_members (club_id, user_id, role)
       VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','manager')
       ON CONFLICT DO NOTHING;`
    );

    await client.query(
      `INSERT INTO tournaments (id, slug, name, season, starts_on, ends_on, registration_open_at, registration_close_at, is_public)
       VALUES ('20000000-0000-0000-0000-000000000001','season-2026','Season 2026 Championship','2026','2026-05-01','2026-05-30', NOW() - INTERVAL '30 days', NOW() + INTERVAL '30 days', TRUE)
       ON CONFLICT (slug) DO NOTHING;`
    );

    await client.query(
      `INSERT INTO profiles (id, user_id, club_id, first_name, last_name, discipline, weight_kg, weight_class)
       VALUES ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','Diego','Ruiz','MMA - Full Contact',77.2,'Welterweight')
       ON CONFLICT (user_id) DO NOTHING;`
    );
  });

  logger.info({ adminEmail }, 'Seed complete');
}

run()
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());

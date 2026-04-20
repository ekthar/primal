#!/usr/bin/env node

const { pool, transaction } = require('../db');
const { hashPassword } = require('../security');
const { logger } = require('../logger');

const FIRST_NAMES = [
  'Aarav', 'Vihaan', 'Reyansh', 'Atharv', 'Advik', 'Ayaan', 'Ishaan', 'Kabir', 'Arjun', 'Vivaan',
  'Anaya', 'Diya', 'Aadhya', 'Myra', 'Kiara', 'Ira', 'Sara', 'Riya', 'Anika', 'Navya',
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Singh', 'Patel', 'Gupta', 'Kumar', 'Reddy', 'Nair', 'Iyer', 'Mehta',
  'Joshi', 'Kapoor', 'Bose', 'Ghosh', 'Mishra', 'Yadav', 'Khan', 'Das', 'Kulkarni', 'Agarwal',
];

const DISCIPLINES = ['MMA', 'Kickboxing', 'Boxing', 'Wrestling', 'Judo', 'BJJ'];
const GENDERS = ['male', 'female'];

function readArg(name, fallback) {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (!arg) return fallback;
  const value = Number.parseInt(arg.split('=')[1], 10);
  if (Number.isNaN(value)) return fallback;
  return value;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function pad(value, size) {
  return String(value).padStart(size, '0');
}

function dateOfBirthFor(index) {
  const year = 1988 + (index % 17);
  const month = 1 + (index % 12);
  const day = 1 + (index % 28);
  return `${year}-${pad(month, 2)}-${pad(day, 2)}`;
}

function randFrom(list, index, salt = 0) {
  return list[(index + salt) % list.length];
}

function profileAddress(index) {
  const stateDistrict = [
    ['Delhi', 'New Delhi', '110001'],
    ['Maharashtra', 'Mumbai', '400001'],
    ['Karnataka', 'Bengaluru', '560001'],
    ['Tamil Nadu', 'Chennai', '600001'],
    ['Uttar Pradesh', 'Lucknow', '226001'],
    ['West Bengal', 'Kolkata', '700001'],
  ][index % 6];

  return {
    country: 'India',
    state: stateDistrict[0],
    district: stateDistrict[1],
    line1: `Load Test Block ${1 + (index % 50)}`,
    line2: `Sector ${1 + (index % 20)}`,
    postalCode: stateDistrict[2],
  };
}

async function ensureReviewer(client, passwordHash) {
  const existing = await client.query(
    `SELECT id FROM users WHERE role = 'reviewer' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const created = await client.query(
    `INSERT INTO users (email, password_hash, role, name, email_verified)
     VALUES ($1, $2, 'reviewer', $3, TRUE)
     ON CONFLICT (email) DO UPDATE SET role = 'reviewer', deleted_at = NULL
     RETURNING id`,
    ['loadtest.reviewer@primal.local', passwordHash, 'Loadtest Reviewer']
  );
  return created.rows[0].id;
}

async function ensureTournament(client) {
  const out = await client.query(
    `INSERT INTO tournaments (slug, name, season, starts_on, ends_on, registration_open_at, registration_close_at, is_public)
     VALUES ($1, $2, $3, CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE + INTERVAL '45 days', NOW() - INTERVAL '21 days', NOW() + INTERVAL '21 days', TRUE)
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           season = EXCLUDED.season,
           is_public = TRUE,
           deleted_at = NULL,
           updated_at = NOW()
     RETURNING id`,
    ['loadtest-bracket-2026', 'Load Test Bracket 2026', '2026-loadtest']
  );
  return out.rows[0].id;
}

async function ensureClubs(client, clubsCount) {
  const clubs = [];
  for (let i = 1; i <= clubsCount; i += 1) {
    const slug = `loadtest-club-${pad(i, 3)}`;
    const name = `Loadtest Club ${pad(i, 3)}`;
    const city = `City ${pad(i, 2)}`;
    const result = await client.query(
      `INSERT INTO clubs (name, slug, city, country, status, metadata)
       VALUES ($1, $2, $3, 'India', 'active', $4::jsonb)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             city = EXCLUDED.city,
             country = 'India',
             status = 'active',
             metadata = EXCLUDED.metadata,
             deleted_at = NULL,
             updated_at = NOW()
       RETURNING id, name, slug`,
      [name, slug, city, JSON.stringify({ loadTest: true })]
    );
    clubs.push(result.rows[0]);
  }
  return clubs;
}

async function resetLoadTestData(client) {
  await client.query(`DELETE FROM applications WHERE submitted_by IN (SELECT id FROM users WHERE email LIKE 'loadtest.participant.%@example.test')`);
  await client.query(`DELETE FROM profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'loadtest.participant.%@example.test')`);
  await client.query(`DELETE FROM users WHERE email LIKE 'loadtest.participant.%@example.test'`);
  await client.query(`DELETE FROM clubs WHERE slug LIKE 'loadtest-club-%'`);
  await client.query(`DELETE FROM tournaments WHERE slug = 'loadtest-bracket-2026'`);
}

async function run() {
  const participantsCount = Math.max(1, readArg('--count', 1500));
  const clubsCount = Math.max(1, readArg('--clubs', 24));
  const shouldReset = hasFlag('--reset');

  const defaultPasswordHash = await hashPassword('demo1234');

  const summary = await transaction(async (client) => {
    if (shouldReset) {
      await resetLoadTestData(client);
    }

    const reviewerId = await ensureReviewer(client, defaultPasswordHash);
    const tournamentId = await ensureTournament(client);
    const clubs = await ensureClubs(client, clubsCount);

    let createdOrUpdatedUsers = 0;
    let createdOrUpdatedProfiles = 0;
    let createdOrUpdatedApplications = 0;

    for (let i = 1; i <= participantsCount; i += 1) {
      const firstName = randFrom(FIRST_NAMES, i);
      const lastName = randFrom(LAST_NAMES, i, 7);
      const fullName = `${firstName} ${lastName}`;
      const email = `loadtest.participant.${pad(i, 4)}@example.test`;
      const gender = randFrom(GENDERS, i);
      const discipline = randFrom(DISCIPLINES, i, 3);
      const dob = dateOfBirthFor(i);
      const weightKg = (48 + (i % 42) + (i % 10) / 10).toFixed(1);
      const clubId = i % 10 < 7 ? clubs[(i - 1) % clubs.length].id : null;
      const address = profileAddress(i);

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, name, locale, email_verified)
         VALUES ($1, $2, 'applicant', $3, 'en', TRUE)
         ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name,
               role = 'applicant',
               deleted_at = NULL,
               updated_at = NOW()
         RETURNING id`,
        [email, defaultPasswordHash, fullName]
      );
      const userId = userResult.rows[0].id;
      createdOrUpdatedUsers += 1;

      const profileResult = await client.query(
        `INSERT INTO profiles (
            user_id, club_id, first_name, last_name, date_of_birth, gender, nationality,
            discipline, weight_kg, weight_class, record_wins, record_losses, record_draws, bio, metadata
          )
         VALUES ($1, $2, $3, $4, $5::date, $6, 'India', $7, $8::numeric, $9, $10, $11, $12, $13, $14::jsonb)
         ON CONFLICT (user_id) DO UPDATE
           SET club_id = EXCLUDED.club_id,
               first_name = EXCLUDED.first_name,
               last_name = EXCLUDED.last_name,
               date_of_birth = EXCLUDED.date_of_birth,
               gender = EXCLUDED.gender,
               nationality = 'India',
               discipline = EXCLUDED.discipline,
               weight_kg = EXCLUDED.weight_kg,
               weight_class = EXCLUDED.weight_class,
               record_wins = EXCLUDED.record_wins,
               record_losses = EXCLUDED.record_losses,
               record_draws = EXCLUDED.record_draws,
               bio = EXCLUDED.bio,
               metadata = EXCLUDED.metadata,
               deleted_at = NULL,
               updated_at = NOW()
         RETURNING id`,
        [
          userId,
          clubId,
          firstName,
          lastName,
          dob,
          gender,
          discipline,
          weightKg,
          `${Math.floor(Number(weightKg) / 5) * 5}-${Math.floor(Number(weightKg) / 5) * 5 + 4} kg`,
          i % 25,
          i % 13,
          i % 7,
          'Load test participant seeded for bracket and queue validation.',
          JSON.stringify({
            loadTest: true,
            phone: `90000${pad(i % 100000, 5)}`,
            address,
            createdBy: 'seed.loadtest.js',
          }),
        ]
      );
      const profileId = profileResult.rows[0].id;
      createdOrUpdatedProfiles += 1;

      await client.query(
        `INSERT INTO applications (
            profile_id, tournament_id, club_id, submitted_by, status, form_data,
            reviewer_id, reviewer_assigned_at, submitted_at, review_started_at, review_due_at, decided_at
          )
         VALUES (
            $1, $2, $3, $4, 'approved', $5::jsonb,
            $6, NOW() - INTERVAL '7 days', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days'
          )
         ON CONFLICT (profile_id, tournament_id) DO UPDATE
           SET club_id = EXCLUDED.club_id,
               submitted_by = EXCLUDED.submitted_by,
               status = 'approved',
               form_data = EXCLUDED.form_data,
               reviewer_id = EXCLUDED.reviewer_id,
               reviewer_assigned_at = EXCLUDED.reviewer_assigned_at,
               submitted_at = EXCLUDED.submitted_at,
               review_started_at = EXCLUDED.review_started_at,
               review_due_at = EXCLUDED.review_due_at,
               decided_at = EXCLUDED.decided_at,
               deleted_at = NULL,
               updated_at = NOW()`,
        [
          profileId,
          tournamentId,
          clubId,
          userId,
          JSON.stringify({
            selectedDisciplines: [discipline],
            experienceLevel: i % 3 === 0 ? 'advanced' : i % 2 === 0 ? 'intermediate' : 'beginner',
            notes: 'Load test generated application for bracket simulation.',
            loadTest: true,
          }),
          reviewerId,
        ]
      );
      createdOrUpdatedApplications += 1;
    }

    return {
      tournamentId,
      clubsCount: clubs.length,
      participantsCount,
      createdOrUpdatedUsers,
      createdOrUpdatedProfiles,
      createdOrUpdatedApplications,
      mode: shouldReset ? 'reset-and-seed' : 'upsert',
    };
  });

  logger.info(summary, 'Load test seeding complete');
  console.log('Load test seeding complete:');
  console.log(JSON.stringify(summary, null, 2));
}

run()
  .catch((err) => {
    logger.error({ err }, 'Load test seeding failed');
    process.exit(1);
  })
  .finally(() => pool.end());

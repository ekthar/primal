// Pure tests for chooseCurrentSeason — the selection rule that drives the
// "current season" default filter on the weigh-in board, applicant dashboard,
// and reports. No database required.
import { describe, it, expect } from 'vitest';
import { chooseCurrentSeason } from '../src/services/tournament.service.js';

const NOW = new Date('2026-04-24T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

function makeTournament(overrides = {}) {
  return {
    id: overrides.id || 'tid',
    name: overrides.name || 'Season',
    registrationOpen: false,
    starts_on: null,
    ends_on: null,
    ...overrides,
  };
}

describe('chooseCurrentSeason', () => {
  it('returns null for empty input', () => {
    expect(chooseCurrentSeason([], NOW)).toBeNull();
    expect(chooseCurrentSeason(null, NOW)).toBeNull();
  });

  it('prefers a tournament whose registration is open right now', () => {
    const past = makeTournament({ id: 'past', starts_on: new Date(NOW - 200 * DAY), ends_on: new Date(NOW - 100 * DAY) });
    const live = makeTournament({ id: 'live', registrationOpen: true });
    const future = makeTournament({ id: 'future', starts_on: new Date(NOW + 30 * DAY), ends_on: new Date(NOW + 45 * DAY) });
    expect(chooseCurrentSeason([past, live, future], NOW).id).toBe('live');
  });

  it('falls back to a tournament whose event dates cover today', () => {
    const past = makeTournament({ id: 'past', starts_on: new Date(NOW - 200 * DAY), ends_on: new Date(NOW - 150 * DAY) });
    const running = makeTournament({
      id: 'running',
      starts_on: new Date(NOW - 2 * DAY),
      ends_on: new Date(NOW + 2 * DAY),
    });
    expect(chooseCurrentSeason([past, running], NOW).id).toBe('running');
  });

  it('honours a 30-day post-event grace window', () => {
    const justFinished = makeTournament({
      id: 'just-finished',
      starts_on: new Date(NOW - 20 * DAY),
      ends_on: new Date(NOW - 10 * DAY), // 10 days ago, still within grace
    });
    const longPast = makeTournament({
      id: 'long-past',
      starts_on: new Date(NOW - 200 * DAY),
      ends_on: new Date(NOW - 100 * DAY),
    });
    expect(chooseCurrentSeason([longPast, justFinished], NOW).id).toBe('just-finished');
  });

  it('rolls off after the 30-day grace expires and falls back to the newest', () => {
    const stale = makeTournament({
      id: 'stale',
      starts_on: new Date(NOW - 200 * DAY),
      ends_on: new Date(NOW - 60 * DAY), // outside 30-day grace
    });
    // Repo returns public tournaments ordered by starts_on DESC, so the
    // "newest" is at index 0.
    expect(chooseCurrentSeason([stale], NOW).id).toBe('stale');
  });
});

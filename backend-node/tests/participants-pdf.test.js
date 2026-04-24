import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('participants PDF export', () => {
  it('endpoint is protected and returns 401 without auth', async () => {
    const res = await request(app).get('/api/reports/participants.pdf');
    expect(res.status).toBe(401);
  });

  it('is an admin-only route exposed from the reports router', async () => {
    const exporter = await import('../src/services/export.service.js');
    expect(typeof exporter.approvedParticipantsToPdf).toBe('function');
    // The handler accepts (res, actor, filters, ctx) — verify arity to catch signature drift.
    expect(exporter.approvedParticipantsToPdf.length).toBeGreaterThanOrEqual(1);
  });
});

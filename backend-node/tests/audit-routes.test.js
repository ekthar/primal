import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('audit routes', () => {
  it('GET /api/audit requires auth', async () => {
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(401);
  });

  it('GET /api/audit/summary requires auth', async () => {
    const res = await request(app).get('/api/audit/summary');
    expect(res.status).toBe(401);
  });

  it('GET /api/audit/verify requires auth', async () => {
    const res = await request(app).get('/api/audit/verify');
    expect(res.status).toBe(401);
  });

  it('GET /api/notifications/recent requires auth', async () => {
    const res = await request(app).get('/api/notifications/recent');
    expect(res.status).toBe(401);
  });
});

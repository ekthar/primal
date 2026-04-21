import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('smoke', () => {
  it('GET /api/health returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('unknown route returns 404 with the standard error shape', async () => {
    const res = await request(app).get('/api/__nope__');
    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('NOT_FOUND');
  });

  it('auth-protected route without token returns 401', async () => {
    const res = await request(app).get('/api/profiles/me');
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('UNAUTHORIZED');
  });

  it('admin tournament route without token returns 401', async () => {
    const res = await request(app).get('/api/tournaments');
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('UNAUTHORIZED');
  });

  it('register with invalid body returns 422', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x' });
    expect(res.status).toBe(422);
    expect(res.body?.error?.code).toBe('UNPROCESSABLE');
  });
});

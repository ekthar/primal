import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('public status route', () => {
  it('GET /api/public/status is anonymous and returns ok shape', async () => {
    const res = await request(app).get('/api/public/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok');
    expect(res.body).toHaveProperty('db');
    expect(res.body).toHaveProperty('counts');
    expect(res.body).toHaveProperty('activity');
    expect(typeof res.body.counts.tournaments).toBe('number');
    expect(typeof res.body.counts.clubs).toBe('number');
  });

  it('GET /api/public/status sets cache-control', async () => {
    const res = await request(app).get('/api/public/status');
    expect(res.headers['cache-control']).toBeDefined();
  });
});

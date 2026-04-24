import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('Wave 3 · album + notification routes', () => {
  it('admin album list is protected', async () => {
    const res = await request(app).get('/api/albums');
    expect(res.status).toBe(401);
  });

  it('admin album create is protected', async () => {
    const res = await request(app).post('/api/albums').send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('admin photo upload is protected', async () => {
    const res = await request(app).post('/api/albums/00000000-0000-0000-0000-000000000000/photos');
    expect(res.status).toBe(401);
  });

  it('admin notification health is protected', async () => {
    const res = await request(app).get('/api/notifications/health');
    expect(res.status).toBe(401);
  });

  it('admin resend notification is protected', async () => {
    const res = await request(app).post('/api/notifications/resend/abc').send({ template: 'application.approved' });
    expect(res.status).toBe(401);
  });

  it('public album list endpoint is mounted (200 or DB-error, never 404)', async () => {
    const res = await request(app).get('/api/public/albums');
    // We only assert the router is mounted — without a DB this can 500, but must not 404.
    expect(res.status).not.toBe(404);
  });
});

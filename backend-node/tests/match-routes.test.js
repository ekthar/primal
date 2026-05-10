import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('match routes', () => {
  it('GET /api/matches/:id requires auth', async () => {
    const res = await request(app).get('/api/matches/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(401);
  });

  it('GET /api/matches/:id is mounted (not 404)', async () => {
    const res = await request(app).get('/api/matches/00000000-0000-0000-0000-000000000000');
    expect(res.status).not.toBe(404);
  });

  it('POST /api/matches/:id/result requires auth', async () => {
    const res = await request(app)
      .post('/api/matches/00000000-0000-0000-0000-000000000000/result')
      .send({
        winnerEntryId: '00000000-0000-0000-0000-000000000000',
        method: 'KO',
        resultRound: 1,
        resultTime: '01:24',
      });
    expect(res.status).toBe(401);
  });

  it('PATCH /api/matches/:id/notes requires auth', async () => {
    const res = await request(app)
      .patch('/api/matches/00000000-0000-0000-0000-000000000000/notes')
      .send({ doctorNotes: 'cut over right eye, cleared' });
    expect(res.status).toBe(401);
  });

  it('PATCH /api/matches/:id/notes is mounted (not 404)', async () => {
    const res = await request(app)
      .patch('/api/matches/00000000-0000-0000-0000-000000000000/notes')
      .send({ doctorNotes: 'cut over right eye, cleared' });
    expect(res.status).not.toBe(404);
  });
});

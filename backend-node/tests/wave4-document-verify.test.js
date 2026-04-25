import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import { schemas } from '../src/validators.js';

describe('Wave 4 · document verify endpoint', () => {
  it('verify endpoint requires auth', async () => {
    const res = await request(app)
      .post('/api/applications/00000000-0000-0000-0000-000000000000/documents/00000000-0000-0000-0000-000000000000/verify')
      .send({ verified: true });
    expect(res.status).toBe(401);
  });

  it('document.create validator accepts capturedVia + idNumberLast4', () => {
    const { error, value } = schemas.document.create.validate({
      kind: 'photo_id',
      capturedVia: 'scan',
      idNumberLast4: '1234',
    });
    expect(error).toBeFalsy();
    expect(value.capturedVia).toBe('scan');
    expect(value.idNumberLast4).toBe('1234');
  });

  it('document.create validator rejects bad capturedVia', () => {
    const { error } = schemas.document.create.validate({ kind: 'photo_id', capturedVia: 'bogus' });
    expect(error).toBeTruthy();
  });

  it('document.create validator rejects 5-digit last4', () => {
    const { error } = schemas.document.create.validate({ kind: 'photo_id', idNumberLast4: '12345' });
    expect(error).toBeTruthy();
  });

  it('document.verify validator requires verified boolean', () => {
    const { error: missing } = schemas.document.verify.validate({});
    expect(missing).toBeTruthy();
    const { error: ok } = schemas.document.verify.validate({ verified: false, reason: 'blurry' });
    expect(ok).toBeFalsy();
  });
});

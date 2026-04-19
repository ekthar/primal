import { describe, it, expect } from 'vitest';
import { schemas } from '../src/validators.js';

describe('validators', () => {
  it('rejects invalid email on register', () => {
    const { error } = schemas.auth.register.validate({ email: 'nope', password: 'longenough', name: 'X' });
    expect(error).toBeTruthy();
  });
  it('accepts valid register payload', () => {
    const { error, value } = schemas.auth.register.validate({ email: 'a@b.io', password: 'longenough', name: 'Alex' });
    expect(error).toBeFalsy();
    expect(value.role).toBe('applicant');
    expect(value.locale).toBe('en');
  });
  it('requires fields array for request_correction', () => {
    const { error } = schemas.review.decision.validate({ action: 'request_correction', reason: 'x' });
    expect(error).toBeTruthy();
  });
  it('accepts approve with no reason', () => {
    const { error } = schemas.review.decision.validate({ action: 'approve' });
    expect(error).toBeFalsy();
  });
});

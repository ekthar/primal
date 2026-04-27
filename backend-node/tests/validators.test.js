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

  it('accepts India-only profile payload with India PIN format', () => {
    const payload = {
      firstName: 'Asha',
      lastName: 'Verma',
      dateOfBirth: '2002-04-10',
      gender: 'female',
      nationality: 'India',
      metadata: {
        address: {
          country: 'India',
          state: 'Delhi',
          district: 'New Delhi',
          line1: 'Connaught Place',
          line2: '',
          postalCode: '110001',
        },
      },
    };
    const { error } = schemas.profile.upsert.validate(payload);
    expect(error).toBeFalsy();
  });

  it('rejects non-India nationality on profile', () => {
    const payload = {
      firstName: 'Asha',
      lastName: 'Verma',
      nationality: 'Nepal',
      metadata: {
        address: {
          country: 'India',
          state: 'Delhi',
          district: 'New Delhi',
          line1: 'Connaught Place',
          postalCode: '110001',
        },
      },
    };
    const { error } = schemas.profile.upsert.validate(payload);
    expect(error).toBeTruthy();
  });

  it('rejects invalid India postal code format', () => {
    const payload = {
      firstName: 'Asha',
      lastName: 'Verma',
      nationality: 'India',
      metadata: {
        address: {
          country: 'India',
          state: 'Delhi',
          district: 'New Delhi',
          line1: 'Connaught Place',
          postalCode: '011000',
        },
      },
    };
    const { error } = schemas.profile.upsert.validate(payload);
    expect(error).toBeTruthy();
  });

  it('rejects non-India club country', () => {
    const { error } = schemas.club.create.validate({
      name: 'Alpha Combat',
      slug: 'alpha-combat',
      city: 'Delhi',
      country: 'Nepal',
    });
    expect(error).toBeTruthy();
  });

  it('accepts forgot password payload', () => {
    const { error } = schemas.auth.forgotPassword.validate({ email: 'user@example.com' });
    expect(error).toBeFalsy();
  });

  it('rejects weak reset password payload', () => {
    const { error } = schemas.auth.resetPassword.validate({ token: 'abc', newPassword: 'short' });
    expect(error).toBeTruthy();
  });

  it('accepts club participant creation payload', () => {
    const { error } = schemas.club.createParticipant.validate({
      email: 'fighter@example.com',
      fullName: 'Fighter One',
      dateOfBirth: '2000-01-01',
      address: {
        country: 'India',
        state: 'Delhi',
        district: 'New Delhi',
        line1: 'Connaught Place',
        postalCode: '110001',
      },
      sendResetLink: true,
    });
    expect(error).toBeFalsy();
  });

  it('rejects tournament settings with registration close before open', () => {
    const { error } = schemas.tournament.adminUpdate.validate({
      registrationOpenAt: '2026-05-10T10:00:00.000Z',
      registrationCloseAt: '2026-05-09T10:00:00.000Z',
    });
    expect(error).toBeTruthy();
  });

  it('accepts admin reweigh payload', () => {
    const { error } = schemas.profile.adminReweigh.validate({ weightKg: 63.4 });
    expect(error).toBeFalsy();
  });

  it('accepts state_coordinator role on adminCreateUser with stateCode', () => {
    const { error } = schemas.auth.adminCreateUser.validate({
      email: 'sc@primalfight.io',
      password: 'longenough',
      name: 'Maharashtra Coord',
      role: 'state_coordinator',
      stateCode: 'Maharashtra',
    });
    expect(error).toBeFalsy();
  });

  it('queue.list accepts stateCode filter', () => {
    const { error, value } = schemas.queue.list.validate({ stateCode: 'Karnataka' });
    expect(error).toBeFalsy();
    expect(value.stateCode).toBe('Karnataka');
  });

  it('match.result requires method/resultRound/resultTime', () => {
    const winnerEntryId = '11111111-1111-1111-1111-111111111111';
    const missing = schemas.match.result.validate({ winnerEntryId });
    expect(missing.error).toBeTruthy();
    const ok = schemas.match.result.validate({
      winnerEntryId,
      method: 'KO',
      resultRound: 2,
      resultTime: '1:34',
    });
    expect(ok.error).toBeFalsy();
  });

  it('match.result rejects unknown methods and bad time format', () => {
    const winnerEntryId = '11111111-1111-1111-1111-111111111111';
    const badMethod = schemas.match.result.validate({
      winnerEntryId, method: 'OTHER', resultRound: 1, resultTime: '0:30',
    });
    expect(badMethod.error).toBeTruthy();
    const badTime = schemas.match.result.validate({
      winnerEntryId, method: 'TKO', resultRound: 1, resultTime: '90s',
    });
    expect(badTime.error).toBeTruthy();
  });
});

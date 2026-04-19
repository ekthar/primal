// Pure-function tests for the status machine — no DB required.
import { describe, it, expect } from 'vitest';
import { STATUS, canTransition, assertTransition } from '../src/statusMachine.js';

describe('statusMachine', () => {
  it('allows documented forward transitions', () => {
    expect(canTransition(STATUS.DRAFT, STATUS.SUBMITTED)).toBe(true);
    expect(canTransition(STATUS.SUBMITTED, STATUS.UNDER_REVIEW)).toBe(true);
    expect(canTransition(STATUS.UNDER_REVIEW, STATUS.APPROVED)).toBe(true);
    expect(canTransition(STATUS.UNDER_REVIEW, STATUS.REJECTED)).toBe(true);
    expect(canTransition(STATUS.UNDER_REVIEW, STATUS.NEEDS_CORRECTION)).toBe(true);
    expect(canTransition(STATUS.NEEDS_CORRECTION, STATUS.SUBMITTED)).toBe(true);
  });

  it('rejects forbidden transitions', () => {
    expect(canTransition(STATUS.DRAFT, STATUS.APPROVED)).toBe(false);
    expect(canTransition(STATUS.APPROVED, STATUS.REJECTED)).toBe(false);
    expect(canTransition(STATUS.REJECTED, STATUS.APPROVED)).toBe(false);
    expect(canTransition(STATUS.NEEDS_CORRECTION, STATUS.APPROVED)).toBe(false);
  });

  it('admin can reopen approved/rejected into under_review', () => {
    expect(canTransition(STATUS.REJECTED, STATUS.UNDER_REVIEW)).toBe(true);
    expect(canTransition(STATUS.APPROVED, STATUS.UNDER_REVIEW)).toBe(true);
  });

  it('enforces actor roles', () => {
    expect(() => assertTransition(STATUS.SUBMITTED, STATUS.APPROVED, 'applicant')).toThrow();
    expect(() => assertTransition(STATUS.SUBMITTED, STATUS.APPROVED, 'reviewer')).not.toThrow();
    expect(() => assertTransition(STATUS.REJECTED, STATUS.UNDER_REVIEW, 'reviewer')).toThrow();
    expect(() => assertTransition(STATUS.REJECTED, STATUS.UNDER_REVIEW, 'admin')).not.toThrow();
  });

  it('throws an illegal-transition error with details', () => {
    try {
      assertTransition(STATUS.DRAFT, STATUS.APPROVED, 'admin');
    } catch (e) {
      expect(e.status).toBe(409);
      expect(e.code).toBe('ILLEGAL_TRANSITION');
      expect(e.details).toEqual({ from: STATUS.DRAFT, to: STATUS.APPROVED });
    }
  });
});

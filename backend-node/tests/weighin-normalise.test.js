import { describe, it, expect } from 'vitest';
import { normaliseWeightKg } from '../src/services/weighin.service.js';

describe('normaliseWeightKg', () => {
  it('passes integer kilograms through unchanged', () => {
    expect(normaliseWeightKg(65)).toBe(65);
    expect(normaliseWeightKg('65')).toBe(65);
    expect(normaliseWeightKg(66)).toBe(66);
  });

  it('preserves two-decimal precision', () => {
    expect(normaliseWeightKg(64.85)).toBe(64.85);
    expect(normaliseWeightKg('72.50')).toBe(72.5);
  });

  it('rounds to the nearest 0.01 kg without floating-point drift', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE-754; the naive x*10/10 trick
    // was the original source of "65 gets saved as 64.8" type bugs.
    expect(normaliseWeightKg(0.1 + 0.2)).toBe(0.3);
    expect(normaliseWeightKg(65.005)).toBeCloseTo(65.01, 5);
  });

  it('returns null for non-numeric input', () => {
    expect(normaliseWeightKg('')).toBeNull();
    expect(normaliseWeightKg(undefined)).toBeNull();
    expect(normaliseWeightKg(null)).toBeNull();
    expect(normaliseWeightKg('hello')).toBeNull();
  });
});

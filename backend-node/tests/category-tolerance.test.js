import { describe, it, expect } from 'vitest';
import {
  getWeightClassForDivision,
  buildOfficialCategory,
} from '../src/domain/categoryRules.js';

describe('weight tolerance', () => {
  it('strict (tol=0): 66.1 kg in senior-men escalates above -66 class', () => {
    // -66 class max is 66; 66.0 stays, 66.1 escalates.
    const exact = getWeightClassForDivision('senior-men', 66.0, 0);
    const over = getWeightClassForDivision('senior-men', 66.1, 0);
    expect(exact?.max).toBe(66);
    expect(over?.max).toBeGreaterThan(66);
  });

  it('tol=0.5: 66.4 kg stays in -66 class, 66.6 escalates', () => {
    const inTolerance = getWeightClassForDivision('senior-men', 66.4, 0.5);
    const outOfTolerance = getWeightClassForDivision('senior-men', 66.6, 0.5);
    expect(inTolerance?.max).toBe(66);
    expect(outOfTolerance?.max).toBeGreaterThan(66);
  });

  it('buildOfficialCategory propagates weightToleranceKg', () => {
    const base = {
      disciplineId: 'full-contact',
      gender: 'male',
      dateOfBirth: '1995-01-01',
      onDate: '2025-01-01',
    };
    const strict = buildOfficialCategory({ ...base, weightKg: 66.4 });
    const lenient = buildOfficialCategory({ ...base, weightKg: 66.4, weightToleranceKg: 0.5 });
    expect(lenient.weightClass?.max).toBe(66);
    expect(strict.weightClass?.max).toBeGreaterThan(66);
  });
});

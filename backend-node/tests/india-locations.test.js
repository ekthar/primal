import { describe, it, expect } from 'vitest';
import { getIndiaStates, getDistrictsByState, lookupPincode, validateIndiaAddress } from '../src/indiaLocations.js';

describe('indiaLocations', () => {
  it('returns India states/UT list', () => {
    const states = getIndiaStates();
    expect(Array.isArray(states)).toBe(true);
    expect(states.length).toBeGreaterThan(20);
  });

  it('resolves pincode with state and district', () => {
    const location = lookupPincode('110001');
    expect(location).toBeTruthy();
    expect(location.country).toBe('India');
    expect(location.state).toBeTruthy();
    expect(location.district).toBeTruthy();
  });

  it('returns districts for a valid state', () => {
    const districts = getDistrictsByState('Delhi');
    expect(Array.isArray(districts)).toBe(true);
    expect(districts.length).toBeGreaterThan(0);
  });

  it('rejects pincode-state mismatch in address validator', () => {
    const result = validateIndiaAddress({
      country: 'India',
      state: 'Maharashtra',
      district: 'Mumbai',
      line1: 'Some line',
      postalCode: '110001',
    });
    expect(result.valid).toBe(false);
  });
});

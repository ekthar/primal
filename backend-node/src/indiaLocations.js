const pincodeRows = require('india-pincode-search/db/pincode_db.json');

function asText(value) {
  return String(value || '').trim();
}

function asKey(value) {
  return asText(value).toLowerCase();
}

function normalizePincode(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^[1-9][0-9]{5}$/.test(digits)) return null;
  return digits;
}

const stateByKey = new Map();
const districtsByStateKey = new Map();
const entriesByPincode = new Map();

for (const row of pincodeRows) {
  const state = asText(row.state);
  const district = asText(row.district);
  const city = asText(row.city);
  const village = asText(row.village);
  const office = asText(row.office);
  const pincode = normalizePincode(row.pincode);

  if (!state || !district || !pincode) continue;

  const stateKey = asKey(state);
  const districtKey = asKey(district);

  if (!stateByKey.has(stateKey)) stateByKey.set(stateKey, state);
  if (!districtsByStateKey.has(stateKey)) districtsByStateKey.set(stateKey, new Map());
  const districtMap = districtsByStateKey.get(stateKey);
  if (!districtMap.has(districtKey)) districtMap.set(districtKey, district);

  if (!entriesByPincode.has(pincode)) entriesByPincode.set(pincode, []);
  entriesByPincode.get(pincode).push({
    pincode,
    state,
    district,
    city,
    village,
    office,
  });
}

const INDIA_STATES = Array.from(stateByKey.values()).sort((a, b) => a.localeCompare(b));

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function getIndiaStates() {
  return INDIA_STATES;
}

function getCanonicalStateName(stateInput) {
  return stateByKey.get(asKey(stateInput)) || null;
}

function getDistrictsByState(stateInput) {
  const stateMap = districtsByStateKey.get(asKey(stateInput));
  if (!stateMap) return [];
  return Array.from(stateMap.values()).sort((a, b) => a.localeCompare(b));
}

function lookupPincode(pincodeInput) {
  const pincode = normalizePincode(pincodeInput);
  if (!pincode) return null;
  const rows = entriesByPincode.get(pincode);
  if (!rows || !rows.length) return null;

  const primary = rows[0];
  return {
    country: 'India',
    pincode,
    state: primary.state,
    district: primary.district,
    offices: uniqueSorted(rows.map((r) => r.office)),
    cities: uniqueSorted(rows.map((r) => r.city)),
    villages: uniqueSorted(rows.map((r) => r.village)),
  };
}

function validateIndiaAddress(addressInput) {
  if (!addressInput || typeof addressInput !== 'object') {
    return { valid: false, field: 'metadata.address', reason: 'Address is required' };
  }

  const country = asText(addressInput.country || 'India');
  if (asKey(country) !== 'india') {
    return { valid: false, field: 'metadata.address.country', reason: 'Country must be India' };
  }

  const state = asText(addressInput.state);
  const district = asText(addressInput.district);
  const pincode = normalizePincode(addressInput.postalCode);

  if (!state) return { valid: false, field: 'metadata.address.state', reason: 'State is required' };
  if (!district) return { valid: false, field: 'metadata.address.district', reason: 'District is required' };
  if (!pincode) {
    return { valid: false, field: 'metadata.address.postalCode', reason: 'Postal code must be a valid 6-digit India PIN' };
  }

  const canonicalState = getCanonicalStateName(state);
  if (!canonicalState) {
    return { valid: false, field: 'metadata.address.state', reason: 'Unknown India state/UT' };
  }

  const districts = getDistrictsByState(canonicalState);
  const districtMap = new Map(districts.map((d) => [asKey(d), d]));
  const canonicalDistrict = districtMap.get(asKey(district));
  if (!canonicalDistrict) {
    return { valid: false, field: 'metadata.address.district', reason: 'Unknown district for selected state/UT' };
  }

  const lookup = lookupPincode(pincode);
  if (!lookup) {
    return { valid: false, field: 'metadata.address.postalCode', reason: 'PIN code not found in India directory' };
  }

  if (asKey(lookup.state) !== asKey(canonicalState)) {
    return {
      valid: false,
      field: 'metadata.address.state',
      reason: `PIN code belongs to ${lookup.state}, not ${canonicalState}`,
    };
  }

  if (asKey(lookup.district) !== asKey(canonicalDistrict)) {
    return {
      valid: false,
      field: 'metadata.address.district',
      reason: `PIN code belongs to ${lookup.district}, not ${canonicalDistrict}`,
    };
  }

  return {
    valid: true,
    normalized: {
      ...addressInput,
      country: 'India',
      state: lookup.state,
      district: lookup.district,
      postalCode: pincode,
    },
    lookup,
  };
}

module.exports = {
  getIndiaStates,
  getCanonicalStateName,
  getDistrictsByState,
  lookupPincode,
  validateIndiaAddress,
};

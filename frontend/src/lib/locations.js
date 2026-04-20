export const COUNTRY_OPTIONS = [
  "India",
];

export const REGION_OPTIONS_BY_COUNTRY = {
  India: {},
};

export function getStatesByCountry(country) {
  const states = REGION_OPTIONS_BY_COUNTRY[country];
  return states ? Object.keys(states) : [];
}

export function getDistrictsByCountryState(country, state) {
  if (!country || !state) return [];
  return REGION_OPTIONS_BY_COUNTRY[country]?.[state] || [];
}

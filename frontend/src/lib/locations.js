export const COUNTRY_OPTIONS = [
  "India",
  "Nepal",
  "Bangladesh",
  "Sri Lanka",
  "Bhutan",
];

export const REGION_OPTIONS_BY_COUNTRY = {
  India: {
    Maharashtra: ["Mumbai", "Pune", "Nagpur", "Nashik"],
    Karnataka: ["Bengaluru Urban", "Mysuru", "Mangaluru", "Belagavi"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli"],
    Telangana: ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar"],
    "Uttar Pradesh": ["Lucknow", "Kanpur Nagar", "Varanasi", "Agra"],
    Delhi: ["Central Delhi", "South Delhi", "North West Delhi", "East Delhi"],
  },
  Nepal: {
    Bagmati: ["Kathmandu", "Lalitpur", "Bhaktapur"],
    Gandaki: ["Kaski", "Lamjung", "Gorkha"],
    Koshi: ["Morang", "Sunsari", "Jhapa"],
  },
  Bangladesh: {
    Dhaka: ["Dhaka", "Gazipur", "Narayanganj"],
    Chattogram: ["Chattogram", "Cox's Bazar", "Cumilla"],
    Rajshahi: ["Rajshahi", "Bogura", "Pabna"],
  },
  "Sri Lanka": {
    Western: ["Colombo", "Gampaha", "Kalutara"],
    Central: ["Kandy", "Matale", "Nuwara Eliya"],
    Southern: ["Galle", "Matara", "Hambantota"],
  },
  Bhutan: {
    Thimphu: ["Thimphu"],
    Paro: ["Paro"],
    Punakha: ["Punakha"],
  },
};

export function getStatesByCountry(country) {
  const states = REGION_OPTIONS_BY_COUNTRY[country];
  return states ? Object.keys(states) : [];
}

export function getDistrictsByCountryState(country, state) {
  if (!country || !state) return [];
  return REGION_OPTIONS_BY_COUNTRY[country]?.[state] || [];
}

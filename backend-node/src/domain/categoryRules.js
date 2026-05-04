const DISCIPLINE_DEFINITIONS = [
  { id: 'kids-grouping', label: 'Kids Grouping', shortLabel: 'Kids', minAge: 6, ruleset: 'Height, weight & size' },
  { id: 'light-contact', label: 'Light Contact', shortLabel: 'LC', minAge: 11, ruleset: 'Light Contact' },
  { id: 'full-contact', label: 'Full Contact', shortLabel: 'FC', minAge: 11, ruleset: 'Full Contact' },
  { id: 'low-kick', label: 'Low Kick', shortLabel: 'LK', minAge: 15, ruleset: 'Low Kick' },
  { id: 'k1-rules', label: 'K1 Rules', shortLabel: 'K1', minAge: 16, ruleset: 'Pro Fight' },
];

const AGE_GROUPS = [
  { id: 'kids-2018-2019', label: 'Kids 2018-2019', minBirthYear: 2018, maxBirthYear: 2019 },
  { id: 'kids-2016-2017', label: 'Kids 2016-2017', minBirthYear: 2016, maxBirthYear: 2017 },
  { id: 'under-12', label: 'Under 12', minBirthYear: 2014, maxBirthYear: 2015 },
  { id: 'under-14', label: 'Under 14', minBirthYear: 2012, maxBirthYear: 2013 },
  { id: 'under-16', label: 'Under 16', minBirthYear: 2010, maxBirthYear: 2011 },
  { id: 'under-18', label: 'Under 18', minBirthYear: 2008, maxBirthYear: 2009 },
  { id: 'senior-men', label: 'Senior Men', gender: 'male', minAge: 18 },
  { id: 'senior-women', label: 'Senior Women', gender: 'female', minAge: 18 },
  { id: 'pro-fight-boys', label: 'Pro Fight Boys', gender: 'male', disciplineId: 'k1-rules', minAge: 16 },
  { id: 'pro-fight-girls', label: 'Pro Fight Girls', gender: 'female', disciplineId: 'k1-rules', minAge: 16 },
];

const OFFICIAL_WEIGHT_CLASS_TABLE = {
  'under-12': [
    { id: 'u12-26', label: '-26 kg', max: 26 },
    { id: 'u12-30', label: '-30 kg', max: 30 },
    { id: 'u12-34', label: '-34 kg', max: 34 },
    { id: 'u12-38', label: '-38 kg', max: 38 },
    { id: 'u12-42', label: '-42 kg', max: 42 },
    { id: 'u12-42-plus', label: '+42 kg', max: 999 },
  ],
  'under-14': [
    { id: 'u14-30', label: '-30 kg', max: 30 },
    { id: 'u14-34', label: '-34 kg', max: 34 },
    { id: 'u14-38', label: '-38 kg', max: 38 },
    { id: 'u14-42', label: '-42 kg', max: 42 },
    { id: 'u14-46', label: '-46 kg', max: 46 },
    { id: 'u14-50', label: '-50 kg', max: 50 },
    { id: 'u14-50-plus', label: '+50 kg', max: 999 },
  ],
  'under-16': [
    { id: 'u16-38', label: '-38 kg', max: 38 },
    { id: 'u16-42', label: '-42 kg', max: 42 },
    { id: 'u16-46', label: '-46 kg', max: 46 },
    { id: 'u16-50', label: '-50 kg', max: 50 },
    { id: 'u16-54', label: '-54 kg', max: 54 },
    { id: 'u16-58', label: '-58 kg', max: 58 },
    { id: 'u16-60', label: '-60 kg', max: 60 },
    { id: 'u16-62', label: '-62 kg', max: 62 },
    { id: 'u16-62-plus', label: '+62 kg', max: 999 },
  ],
  'under-18': [
    { id: 'u18-42', label: '-42 kg', max: 42 },
    { id: 'u18-46', label: '-46 kg', max: 46 },
    { id: 'u18-50', label: '-50 kg', max: 50 },
    { id: 'u18-54', label: '-54 kg', max: 54 },
    { id: 'u18-58', label: '-58 kg', max: 58 },
    { id: 'u18-62', label: '-62 kg', max: 62 },
    { id: 'u18-68', label: '-68 kg', max: 68 },
    { id: 'u18-68-plus', label: '+68 kg', max: 999 },
  ],
  'senior-men': [
    { id: 'sm-50', label: '-50 kg', max: 50 },
    { id: 'sm-55', label: '-55 kg', max: 55 },
    { id: 'sm-60', label: '-60 kg', max: 60 },
    { id: 'sm-66', label: '-66 kg', max: 66 },
    { id: 'sm-72', label: '-72 kg', max: 72 },
    { id: 'sm-78', label: '-78 kg', max: 78 },
    { id: 'sm-85', label: '-85 kg', max: 85 },
    { id: 'sm-85-plus', label: '+85 kg', max: 999 },
  ],
  'senior-women': [
    { id: 'sw-46', label: '-46 kg', max: 46 },
    { id: 'sw-50', label: '-50 kg', max: 50 },
    { id: 'sw-55', label: '-55 kg', max: 55 },
    { id: 'sw-60', label: '-60 kg', max: 60 },
    { id: 'sw-65', label: '-65 kg', max: 65 },
    { id: 'sw-70', label: '-70 kg', max: 70 },
    { id: 'sw-70-plus', label: '+70 kg', max: 999 },
  ],
  'pro-fight-girls': [
    { id: 'pfg-52', label: '-52 kg', max: 52 },
    { id: 'pfg-58', label: '-58 kg', max: 58 },
  ],
  'pro-fight-boys': [
    { id: 'pfb-58', label: '-58 kg', max: 58 },
    { id: 'pfb-66', label: '-66 kg', max: 66 },
    { id: 'pfb-75', label: '-75 kg', max: 75 },
  ],
};

const AGE_DISCIPLINES = {
  'kids-2018-2019': ['kids-grouping'],
  'kids-2016-2017': ['kids-grouping'],
  'under-12': ['light-contact', 'full-contact'],
  'under-14': ['light-contact', 'full-contact'],
  'under-16': ['light-contact', 'full-contact', 'low-kick'],
  'under-18': ['light-contact', 'full-contact', 'low-kick'],
  'senior-men': ['light-contact', 'full-contact', 'low-kick'],
  'senior-women': ['light-contact', 'full-contact', 'low-kick'],
  'pro-fight-girls': ['k1-rules'],
  'pro-fight-boys': ['k1-rules'],
};

function numericYear(dateOfBirth) {
  const year = Number(String(dateOfBirth || '').slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function calculateAge(dateOfBirth, onDate) {
  const birth = new Date(dateOfBirth);
  const event = new Date(onDate);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(event.getTime())) return null;
  let age = event.getFullYear() - birth.getFullYear();
  const monthDelta = event.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && event.getDate() < birth.getDate())) age -= 1;
  return age;
}

function getDisciplineById(disciplineId) {
  return DISCIPLINE_DEFINITIONS.find((discipline) => discipline.id === disciplineId) || null;
}

function resolveOfficialDivision(input) {
  const disciplineId = String(input?.disciplineId || '');
  const gender = String(input?.gender || '').toLowerCase();
  const birthYear = numericYear(input?.dateOfBirth);
  const age = calculateAge(input?.dateOfBirth, input?.onDate || new Date().toISOString());

  if (disciplineId === 'k1-rules') {
    if (gender === 'female') return AGE_GROUPS.find((group) => group.id === 'pro-fight-girls');
    if (gender === 'male') return AGE_GROUPS.find((group) => group.id === 'pro-fight-boys');
    return null;
  }

  if (birthYear !== null) {
    const birthYearDivision = AGE_GROUPS.find((group) => (
      group.minBirthYear !== undefined
      && birthYear >= group.minBirthYear
      && birthYear <= group.maxBirthYear
    ));
    if (birthYearDivision) return birthYearDivision;
  }

  if (age !== null && age >= 18) {
    if (gender === 'female') return AGE_GROUPS.find((group) => group.id === 'senior-women');
    return AGE_GROUPS.find((group) => group.id === 'senior-men');
  }

  return null;
}

function getAllowedDisciplinesForDivision(divisionId) {
  return AGE_DISCIPLINES[divisionId] || [];
}

function getWeightClassForDivision(divisionId, weightKg) {
  const numericWeight = Number(weightKg);
  if (!Number.isFinite(numericWeight)) return null;
  const table = OFFICIAL_WEIGHT_CLASS_TABLE[divisionId] || [];
  return table.find((weightClass) => numericWeight <= weightClass.max) || table[table.length - 1] || null;
}

function buildOfficialCategory(input) {
  const discipline = getDisciplineById(input?.disciplineId);
  const division = resolveOfficialDivision(input);
  const age = calculateAge(input?.dateOfBirth, input?.onDate || new Date().toISOString());
  const issues = [];

  if (!discipline) issues.push('Unknown discipline.');
  if (!input?.gender) issues.push('Gender required.');
  if (!input?.dateOfBirth) issues.push('Date of birth required.');
  if (!input?.weightKg) issues.push('Weight required.');
  if (!division) issues.push('No official category is configured for this age/gender.');
  if (discipline && age !== null && age < discipline.minAge) {
    issues.push(`${discipline.label} opens from age ${discipline.minAge}.`);
  }
  if (division?.minAge && age !== null && age < division.minAge) {
    issues.push(`${division.label} opens from age ${division.minAge}.`);
  }

  const allowedDisciplines = division ? getAllowedDisciplinesForDivision(division.id) : [];
  if (division && discipline && !allowedDisciplines.includes(discipline.id)) {
    issues.push(`${discipline.label} is not available for ${division.label}.`);
  }

  if (division && discipline?.id === 'kids-grouping') {
    const categoryId = issues.length === 0 ? `${division.id}:kids-grouping` : null;
    return {
      valid: issues.length === 0,
      issues,
      discipline,
      division,
      weightClass: null,
      categoryId,
      categoryLabel: categoryId
        ? `${division.label} · Grouped by height, weight & size`
        : 'Complete the required fields to assign a category.',
    };
  }

  const weightClass = division ? getWeightClassForDivision(division.id, input?.weightKg) : null;
  if (division && !weightClass) issues.push(`No weight classes are configured for ${division.label}.`);

  const categoryId = issues.length === 0
    ? `${input.disciplineId}:${division.id}:${weightClass.id}`
    : null;

  return {
    valid: issues.length === 0,
    issues,
    discipline,
    division,
    weightClass,
    categoryId,
    categoryLabel: categoryId
      ? `${division.label} · ${discipline.label} · ${weightClass.label}`
      : 'Complete the required fields to assign a category.',
  };
}

function deriveOfficialWeightClass(input) {
  const category = buildOfficialCategory(input);
  if (category.weightClass?.label) return category.weightClass.label;
  if (category.valid && category.discipline?.id === 'kids-grouping') return 'Grouped by height, weight & size';
  return null;
}

module.exports = {
  AGE_GROUPS,
  DISCIPLINE_DEFINITIONS,
  OFFICIAL_WEIGHT_CLASS_TABLE,
  buildOfficialCategory,
  calculateAge,
  deriveOfficialWeightClass,
  getAllowedDisciplinesForDivision,
  getDisciplineById,
  getWeightClassForDivision,
  resolveOfficialDivision,
};

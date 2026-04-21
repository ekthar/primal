const TOURNAMENT_DATE = "2026-09-12";

export const ENTRY_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const ENTRY_STATUS_LABELS = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

export const BRACKET_STATUS_LABELS = {
  draft: "Draft",
  locked: "Locked",
  live: "Live",
  completed: "Completed",
};

export const GENERATION_PRESETS = [
  {
    id: "fair_draw",
    label: "Fair Draw",
    shortLabel: "Fair",
    description: "Avoid same-club round-one collisions first, then keep seed spread reasonable.",
  },
  {
    id: "seeded_championship",
    label: "Seeded Championship",
    shortLabel: "Seeded",
    description: "Protect top seeds and still try to prevent same-club first-round fights.",
  },
  {
    id: "open_draw",
    label: "Open Draw",
    shortLabel: "Open",
    description: "Looser bracket style with light conflict control when a faster draw is acceptable.",
  },
];

export const EXPERIENCE_LEVELS = [
  { id: "novice", label: "Novice", rank: 1 },
  { id: "intermediate", label: "Intermediate", rank: 2 },
  { id: "advanced", label: "Advanced", rank: 3 },
];

export const GENDER_OPTIONS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
];

export const DISCIPLINE_DEFINITIONS = [
  { id: "kickboxing", label: "Kickboxing", shortLabel: "KB", minAge: 14, ruleset: "Striking" },
  { id: "full-contact", label: "Full Contact", shortLabel: "FC", minAge: 14, ruleset: "Full Contact" },
  { id: "mma", label: "MMA", shortLabel: "MMA", minAge: 18, ruleset: "Mixed Martial Arts" },
  { id: "boxing", label: "Boxing", shortLabel: "BOX", minAge: 14, ruleset: "Boxing" },
  { id: "low-kick", label: "Low Kick", shortLabel: "LK", minAge: 14, ruleset: "Low Kick" },
  { id: "light-contact", label: "Light Contact", shortLabel: "LC", minAge: 12, ruleset: "Light Contact" },
  { id: "k1", label: "K1", shortLabel: "K1", minAge: 16, ruleset: "K1" },
];

export const AGE_GROUPS = [
  { id: "cadet", label: "Cadet", min: 12, max: 15 },
  { id: "junior", label: "Junior", min: 16, max: 17 },
  { id: "adult", label: "Adult", min: 18, max: 34 },
  { id: "master", label: "Master", min: 35, max: 45 },
];

const WEIGHT_CLASS_TABLE = {
  male: [
    { id: "m-54", label: "-54 kg", max: 54 },
    { id: "m-57", label: "-57 kg", max: 57 },
    { id: "m-60", label: "-60 kg", max: 60 },
    { id: "m-63-5", label: "-63.5 kg", max: 63.5 },
    { id: "m-67", label: "-67 kg", max: 67 },
    { id: "m-71", label: "-71 kg", max: 71 },
    { id: "m-75", label: "-75 kg", max: 75 },
    { id: "m-81", label: "-81 kg", max: 81 },
    { id: "m-86", label: "-86 kg", max: 86 },
    { id: "m-91", label: "-91 kg", max: 91 },
    { id: "m-91-plus", label: "+91 kg", max: 200 },
  ],
  female: [
    { id: "f-48", label: "-48 kg", max: 48 },
    { id: "f-52", label: "-52 kg", max: 52 },
    { id: "f-56", label: "-56 kg", max: 56 },
    { id: "f-60", label: "-60 kg", max: 60 },
    { id: "f-65", label: "-65 kg", max: 65 },
    { id: "f-70", label: "-70 kg", max: 70 },
    { id: "f-70-plus", label: "+70 kg", max: 200 },
  ],
};

const PARTICIPANT_SEEDS = [
  {
    id: "pt-101",
    fullName: "Aarav Singh",
    gender: "male",
    dob: "2001-05-14",
    weight: 66.8,
    club: "Primal Warriors Delhi",
    nationality: "India",
    experienceLevel: "advanced",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "mixed",
    selectedDisciplines: ["kickboxing", "k1", "boxing"],
    disciplineStatuses: { kickboxing: "approved", k1: "approved", boxing: "pending" },
    seedScore: 92,
  },
  {
    id: "pt-102",
    fullName: "Mira Dsouza",
    gender: "female",
    dob: "2004-11-03",
    weight: 55.7,
    club: "Goa Combat Lab",
    nationality: "India",
    experienceLevel: "intermediate",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["kickboxing", "light-contact"],
    disciplineStatuses: { kickboxing: "approved", "light-contact": "approved" },
    seedScore: 81,
  },
  {
    id: "pt-103",
    fullName: "Rohan Kapoor",
    gender: "male",
    dob: "1998-02-28",
    weight: 74.6,
    club: "Mumbai Strikers",
    nationality: "India",
    experienceLevel: "advanced",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["low-kick", "full-contact"],
    disciplineStatuses: { "low-kick": "approved", "full-contact": "approved" },
    seedScore: 88,
  },
  {
    id: "pt-104",
    fullName: "Jia Chen",
    gender: "female",
    dob: "2007-08-19",
    weight: 51.4,
    club: "Eastern Tigers",
    nationality: "Singapore",
    experienceLevel: "novice",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["light-contact", "boxing"],
    disciplineStatuses: { "light-contact": "approved", boxing: "approved" },
    seedScore: 67,
  },
  {
    id: "pt-105",
    fullName: "Kabir Menon",
    gender: "male",
    dob: "2008-03-07",
    weight: 59.2,
    club: "Kochi Fight Union",
    nationality: "India",
    experienceLevel: "novice",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "pending",
    overallApprovalStatus: "pending",
    selectedDisciplines: ["kickboxing", "boxing"],
    disciplineStatuses: { kickboxing: "pending", boxing: "pending" },
    seedScore: 58,
  },
  {
    id: "pt-106",
    fullName: "Sofia Almeida",
    gender: "female",
    dob: "1996-01-25",
    weight: 60.1,
    club: "Lisbon Fight Factory",
    nationality: "Portugal",
    experienceLevel: "advanced",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["k1", "kickboxing"],
    disciplineStatuses: { k1: "approved", kickboxing: "approved" },
    seedScore: 90,
  },
  {
    id: "pt-107",
    fullName: "Aditya Rao",
    gender: "male",
    dob: "2005-07-11",
    weight: 70.8,
    club: "Hyderabad Fight District",
    nationality: "India",
    experienceLevel: "intermediate",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["k1", "kickboxing", "low-kick"],
    disciplineStatuses: { k1: "approved", kickboxing: "approved", "low-kick": "approved" },
    seedScore: 79,
  },
  {
    id: "pt-108",
    fullName: "Fatima Noor",
    gender: "female",
    dob: "2000-10-09",
    weight: 64.3,
    club: "Desert Wolves",
    nationality: "UAE",
    experienceLevel: "intermediate",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["boxing", "full-contact"],
    disciplineStatuses: { boxing: "approved", "full-contact": "pending" },
    seedScore: 76,
  },
  {
    id: "pt-109",
    fullName: "Haruto Sato",
    gender: "male",
    dob: "1994-06-02",
    weight: 80.9,
    club: "Osaka Knockout Team",
    nationality: "Japan",
    experienceLevel: "advanced",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["full-contact", "low-kick"],
    disciplineStatuses: { "full-contact": "approved", "low-kick": "approved" },
    seedScore: 95,
  },
  {
    id: "pt-110",
    fullName: "Nina Petrova",
    gender: "female",
    dob: "1988-12-17",
    weight: 69.5,
    club: "Sofia Combat Academy",
    nationality: "Bulgaria",
    experienceLevel: "advanced",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["k1"],
    disciplineStatuses: { k1: "approved" },
    seedScore: 86,
  },
  {
    id: "pt-111",
    fullName: "Leo Fernandes",
    gender: "male",
    dob: "2003-09-12",
    weight: 67,
    club: "Rio Combat Systems",
    nationality: "Brazil",
    experienceLevel: "intermediate",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["mma"],
    disciplineStatuses: { mma: "approved" },
    seedScore: 84,
  },
  {
    id: "pt-112",
    fullName: "Imran Qureshi",
    gender: "male",
    dob: "2002-04-23",
    weight: 70.6,
    club: "Karachi Combat House",
    nationality: "Pakistan",
    experienceLevel: "advanced",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["mma", "boxing"],
    disciplineStatuses: { mma: "approved", boxing: "approved" },
    seedScore: 91,
  },
  {
    id: "pt-113",
    fullName: "Anaya Verma",
    gender: "female",
    dob: "2006-02-01",
    weight: 59.8,
    club: "Delhi Panthers",
    nationality: "India",
    experienceLevel: "intermediate",
    documentsStatus: "missing",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "pending",
    selectedDisciplines: ["kickboxing", "k1"],
    disciplineStatuses: { kickboxing: "pending", k1: "rejected" },
    seedScore: 71,
  },
  {
    id: "pt-114",
    fullName: "Omar Haddad",
    gender: "male",
    dob: "2007-06-15",
    weight: 60,
    club: "Casablanca Fight Club",
    nationality: "Morocco",
    experienceLevel: "novice",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["boxing", "light-contact"],
    disciplineStatuses: { boxing: "approved", "light-contact": "approved" },
    seedScore: 62,
  },
  {
    id: "pt-115",
    fullName: "Ishaan Batra",
    gender: "male",
    dob: "1999-07-30",
    weight: 66.4,
    club: "Primal Warriors Delhi",
    nationality: "India",
    experienceLevel: "intermediate",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["kickboxing", "boxing", "k1"],
    disciplineStatuses: { kickboxing: "approved", boxing: "approved", k1: "approved" },
    seedScore: 83,
  },
  {
    id: "pt-116",
    fullName: "Elena Novak",
    gender: "female",
    dob: "1995-03-18",
    weight: 54.8,
    club: "Prague Combat Unit",
    nationality: "Czech Republic",
    experienceLevel: "advanced",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["boxing", "kickboxing"],
    disciplineStatuses: { boxing: "approved", kickboxing: "approved" },
    seedScore: 89,
  },
  {
    id: "pt-117",
    fullName: "Tenzin Dorji",
    gender: "male",
    dob: "2009-09-05",
    weight: 57.8,
    club: "Himalayan Ring Club",
    nationality: "Bhutan",
    experienceLevel: "novice",
    documentsStatus: "complete",
    waiverStatus: "unsigned",
    paymentStatus: "pending",
    overallApprovalStatus: "pending",
    selectedDisciplines: ["light-contact", "kickboxing"],
    disciplineStatuses: { "light-contact": "pending", kickboxing: "pending" },
    seedScore: 54,
  },
  {
    id: "pt-118",
    fullName: "Vikram Malhotra",
    gender: "male",
    dob: "2004-01-12",
    weight: 70.2,
    club: "Mumbai Strikers",
    nationality: "India",
    experienceLevel: "intermediate",
    documentsStatus: "complete",
    waiverStatus: "signed",
    paymentStatus: "paid",
    overallApprovalStatus: "approved",
    selectedDisciplines: ["boxing", "kickboxing"],
    disciplineStatuses: { boxing: "approved", kickboxing: "approved" },
    seedScore: 77,
  },
];

function calculateAge(dob, onDate = TOURNAMENT_DATE) {
  const birth = new Date(dob);
  const event = new Date(onDate);
  let age = event.getFullYear() - birth.getFullYear();
  const monthDelta = event.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && event.getDate() < birth.getDate())) age -= 1;
  return age;
}

function getAgeGroup(age) {
  return AGE_GROUPS.find((group) => age >= group.min && age <= group.max) || AGE_GROUPS[AGE_GROUPS.length - 1];
}

function getDisciplineById(disciplineId) {
  return DISCIPLINE_DEFINITIONS.find((discipline) => discipline.id === disciplineId);
}

function getExperienceLabel(levelId) {
  return EXPERIENCE_LEVELS.find((level) => level.id === levelId)?.label || levelId;
}

function getWeightClass(gender, weight) {
  const classes = WEIGHT_CLASS_TABLE[gender] || WEIGHT_CLASS_TABLE.male;
  return classes.find((weightClass) => weight <= weightClass.max) || classes[classes.length - 1];
}

function titleCase(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getEntryIssues(participant, discipline, age) {
  const issues = [];
  if (age < discipline.minAge) {
    issues.push(`${discipline.label} requires fighters to be at least ${discipline.minAge}.`);
  }
  if (participant.documentsStatus !== "complete") issues.push("Missing or incomplete documents.");
  if (participant.waiverStatus !== "signed") issues.push("Waiver not signed.");
  if (participant.paymentStatus !== "paid") issues.push("Payment still pending.");
  return issues;
}

function buildCategoryId({ disciplineId, ageGroupId, gender, weightClassId, experienceLevel }) {
  return `${disciplineId}:${ageGroupId}:${gender}:${weightClassId}:${experienceLevel}`;
}

export function createPreviewEntries(form) {
  const age = form.dob ? calculateAge(form.dob) : null;
  return (form.selectedDisciplines || []).map((disciplineId) => {
    const discipline = getDisciplineById(disciplineId);
    const ageGroup = age !== null ? getAgeGroup(age) : null;
    const weightClass = form.weight ? getWeightClass(form.gender || "male", Number(form.weight)) : null;
    const issues = [];

    if (!discipline) issues.push("Unknown discipline.");
    if (!form.fullName) issues.push("Full name required.");
    if (!form.gender) issues.push("Gender required.");
    if (!form.dob) issues.push("Date of birth required.");
    if (!form.weight) issues.push("Weight required.");
    if (!form.experienceLevel) issues.push("Experience level required.");
    if (discipline && age !== null && age < discipline.minAge) {
      issues.push(`${discipline.label} opens from age ${discipline.minAge}.`);
    }

    const categoryId =
      discipline && ageGroup && weightClass && form.experienceLevel && issues.length === 0
        ? buildCategoryId({
            disciplineId,
            ageGroupId: ageGroup.id,
            gender: form.gender,
            weightClassId: weightClass.id,
            experienceLevel: form.experienceLevel,
          })
        : null;

    return {
      disciplineId,
      disciplineLabel: discipline?.label || disciplineId,
      valid: issues.length === 0,
      issues,
      ageGroupLabel: ageGroup?.label || "Pending",
      weightClassLabel: weightClass?.label || "Pending",
      experienceLabel: getExperienceLabel(form.experienceLevel),
      categoryId,
      categoryLabel:
        categoryId && discipline
          ? `${discipline.label} · ${ageGroup.label} · ${titleCase(form.gender)} · ${weightClass.label} · ${getExperienceLabel(form.experienceLevel)}`
          : "Complete the required fields to assign a category.",
    };
  });
}

function buildTournamentEntries(participants) {
  return participants.flatMap((participant) => {
    const age = calculateAge(participant.dob);
    const ageGroup = getAgeGroup(age);
    const weightClass = getWeightClass(participant.gender, participant.weight);

    return participant.selectedDisciplines.map((disciplineId, index) => {
      const discipline = getDisciplineById(disciplineId);
      const issues = getEntryIssues(participant, discipline, age);
      const reviewStatus = participant.disciplineStatuses?.[disciplineId] || ENTRY_STATUS.PENDING;
      const categoryId =
        issues.length === 0
          ? buildCategoryId({
              disciplineId,
              ageGroupId: ageGroup.id,
              gender: participant.gender,
              weightClassId: weightClass.id,
              experienceLevel: participant.experienceLevel,
            })
          : null;

      return {
        id: `${participant.id}-${disciplineId}`,
        participantId: participant.id,
        disciplineId,
        disciplineLabel: discipline.label,
        rulesetLabel: discipline.ruleset,
        participantName: participant.fullName,
        club: participant.club,
        nationality: participant.nationality,
        gender: participant.gender,
        age,
        ageGroupId: ageGroup.id,
        ageGroupLabel: ageGroup.label,
        weight: participant.weight,
        weightClassId: weightClass.id,
        weightClassLabel: weightClass.label,
        experienceLevel: participant.experienceLevel,
        experienceLabel: getExperienceLabel(participant.experienceLevel),
        documentsStatus: participant.documentsStatus,
        waiverStatus: participant.waiverStatus,
        paymentStatus: participant.paymentStatus,
        reviewStatus,
        issues,
        invalid: issues.length > 0,
        categoryId,
        categoryLabel:
          categoryId && discipline
            ? `${discipline.label} · ${ageGroup.label} · ${titleCase(participant.gender)} · ${weightClass.label} · ${getExperienceLabel(participant.experienceLevel)}`
            : "Needs admin review",
        submittedAt: `2026-04-${String(4 + index).padStart(2, "0")}T09:30:00Z`,
        updatedAt: `2026-04-${String(12 + index).padStart(2, "0")}T12:00:00Z`,
        seedScore: participant.seedScore - index,
        readinessFlags: {
          medicalClear: participant.documentsStatus === "complete",
          waiverSigned: participant.waiverStatus === "signed",
          feePaid: participant.paymentStatus === "paid",
          weighInComplete: participant.overallApprovalStatus !== "pending",
        },
      };
    });
  });
}

function buildCategoryReport(entries) {
  const grouped = new Map();
  entries.forEach((entry) => {
    const fallbackCategoryId = entry.categoryId || `${entry.disciplineId}:unassigned`;
    const fallbackLabel = entry.categoryId
      ? entry.categoryLabel
      : `${entry.disciplineLabel} · Admin review required`;

    if (!grouped.has(fallbackCategoryId)) {
      grouped.set(fallbackCategoryId, {
        id: fallbackCategoryId,
        disciplineId: entry.disciplineId,
        disciplineLabel: entry.disciplineLabel,
        rulesetLabel: entry.rulesetLabel,
        label: fallbackLabel,
        ageGroupLabel: entry.ageGroupLabel,
        genderLabel: titleCase(entry.gender),
        weightClassLabel: entry.weightClassLabel,
        experienceLabel: entry.experienceLabel,
        entries: [],
        totalCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        invalidCount: 0,
        uniqueClubs: new Set(),
      });
    }

    const category = grouped.get(fallbackCategoryId);
    category.entries.push(entry);
    category.totalCount += 1;
    category.approvedCount += entry.reviewStatus === ENTRY_STATUS.APPROVED ? 1 : 0;
    category.pendingCount += entry.reviewStatus === ENTRY_STATUS.PENDING ? 1 : 0;
    category.rejectedCount += entry.reviewStatus === ENTRY_STATUS.REJECTED ? 1 : 0;
    category.invalidCount += entry.invalid ? 1 : 0;
    if (entry.club) category.uniqueClubs.add(entry.club);
  });

  return Array.from(grouped.values())
    .map((category) => ({
      ...category,
      clubCount: category.uniqueClubs.size,
      uniqueClubs: Array.from(category.uniqueClubs),
      readyForBracket: category.approvedCount >= 2 && category.invalidCount === 0,
      tooFewFighters: category.approvedCount > 0 && category.approvedCount < 4,
      status:
        category.approvedCount >= 4 && category.invalidCount === 0
          ? "ready"
          : category.approvedCount >= 2 && category.invalidCount === 0
            ? "watch"
            : category.invalidCount > 0
              ? "review"
              : "building",
      bracketPolicy: {
        sameClub: "avoid_if_possible",
        categoryIntegrity: "strict",
        minApproved: category.approvedCount >= 4 ? 4 : 2,
      },
    }))
    .sort((a, b) => {
      if (a.disciplineLabel === b.disciplineLabel) return a.label.localeCompare(b.label);
      return a.disciplineLabel.localeCompare(b.disciplineLabel);
    });
}

function buildOverview(entries, categories) {
  const approvedEntries = entries.filter((entry) => entry.reviewStatus === ENTRY_STATUS.APPROVED).length;
  const pendingEntries = entries.filter((entry) => entry.reviewStatus === ENTRY_STATUS.PENDING).length;
  const rejectedEntries = entries.filter((entry) => entry.reviewStatus === ENTRY_STATUS.REJECTED).length;
  const readyCategories = categories.filter((category) => category.readyForBracket).length;

  return {
    totalParticipants: PARTICIPANT_SEEDS.length,
    totalEntries: entries.length,
    approvedEntries,
    pendingEntries,
    rejectedEntries,
    readyCategories,
    bracketShortlist: categories.filter((category) => category.readyForBracket).slice(0, 6),
  };
}

function buildDisciplineSummary(entries, categories) {
  return DISCIPLINE_DEFINITIONS.map((discipline) => {
    const disciplineEntries = entries.filter((entry) => entry.disciplineId === discipline.id);
    const disciplineCategories = categories.filter((category) => category.disciplineId === discipline.id);
    return {
      disciplineId: discipline.id,
      disciplineLabel: discipline.label,
      entryCount: disciplineEntries.length,
      approvedCount: disciplineEntries.filter((entry) => entry.reviewStatus === ENTRY_STATUS.APPROVED).length,
      pendingCount: disciplineEntries.filter((entry) => entry.reviewStatus === ENTRY_STATUS.PENDING).length,
      rejectedCount: disciplineEntries.filter((entry) => entry.reviewStatus === ENTRY_STATUS.REJECTED).length,
      readyCategories: disciplineCategories.filter((category) => category.readyForBracket).length,
      insufficientCategories: disciplineCategories.filter((category) => category.tooFewFighters).length,
    };
  });
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = (i * 7 + 3) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getBracketSize(count) {
  return [2, 4, 8, 16, 32].find((size) => count <= size) || null;
}

function createSeedOrder(size) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const nextSize = seeds.length * 2 + 1;
    const nextSeeds = [];
    seeds.forEach((seed) => {
      nextSeeds.push(seed, nextSize - seed);
    });
    seeds = nextSeeds;
  }
  return seeds;
}

function getRoundLabel(roundIndex, totalRounds) {
  const remaining = totalRounds - roundIndex;
  if (remaining === 0) return "Final";
  if (remaining === 1) return "Semifinal";
  if (remaining === 2) return "Quarterfinal";
  return `Round ${roundIndex + 1}`;
}

function getSeededSlots(entries, size) {
  const order = createSeedOrder(size);
  const ordered = [...entries].sort((a, b) => b.seedScore - a.seedScore);
  const slots = Array(size).fill(null);
  order.forEach((seed, index) => {
    slots[index] = ordered[seed - 1] || null;
  });
  return slots;
}

function getOpenSlots(entries, size) {
  const shuffled = shuffle(entries);
  const slots = Array(size).fill(null);
  shuffled.forEach((entry, index) => {
    slots[index] = entry;
  });
  return slots;
}

function buildPairings(slots) {
  const pairs = [];
  for (let i = 0; i < slots.length; i += 2) {
    pairs.push([slots[i] || null, slots[i + 1] || null]);
  }
  return pairs;
}

function evaluateSlots(slots, presetId) {
  const penalties = [];
  const pairs = buildPairings(slots);
  let total = 0;

  pairs.forEach(([left, right], index) => {
    if (!left || !right) {
      if (!left && !right) {
        total += 12;
        penalties.push({ code: "double_bye", severity: "medium", points: 12, message: `Match ${index + 1} is empty because of bracket sizing.` });
      }
      return;
    }

    if (left.club && right.club && left.club === right.club) {
      const points = presetId === "open_draw" ? 45 : 120;
      total += points;
      penalties.push({
        code: "same_club",
        severity: "critical",
        points,
        message: `${left.participantName} and ${right.participantName} are from ${left.club} in round 1.`,
      });
    }

    const seedGap = Math.abs((left.seedScore || 0) - (right.seedScore || 0));
    if (seedGap >= 14) {
      const points = presetId === "seeded_championship" ? 8 : 18;
      total += points;
      penalties.push({
        code: "seed_gap",
        severity: "low",
        points,
        message: `Match ${index + 1} has a ${seedGap}-point seed gap.`,
      });
    }
  });

  return {
    totalPenalty: total,
    firstRoundPairs: pairs,
    penalties,
    summary: {
      sameClubCollisions: penalties.filter((item) => item.code === "same_club").length,
      largeSeedGaps: penalties.filter((item) => item.code === "seed_gap").length,
      byes: pairs.filter(([left, right]) => !left || !right).length,
    },
  };
}

function optimizeFairDraw(entries, size, presetId) {
  const seeded = getSeededSlots(entries, size);
  let bestSlots = seeded;
  let bestEval = evaluateSlots(bestSlots, presetId);

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const candidateEntries = presetId === "seeded_championship"
      ? [...entries].sort((a, b) => b.seedScore - a.seedScore)
      : shuffle(entries);
    const candidateSlots = presetId === "seeded_championship"
      ? getSeededSlots(candidateEntries, size)
      : getOpenSlots(candidateEntries, size);
    const candidateEval = evaluateSlots(candidateSlots, presetId);
    if (candidateEval.totalPenalty < bestEval.totalPenalty) {
      bestSlots = candidateSlots;
      bestEval = candidateEval;
    }
    if (bestEval.totalPenalty === 0) break;
  }

  return { slots: bestSlots, evaluation: bestEval };
}

function buildBracketFromSlots(category, slots, presetId, evaluation, options = {}) {
  const totalRounds = Math.log2(slots.length);
  const rounds = [];
  let currentSlots = slots.map((entry) => ({ entry, sourceMatchId: null, bye: !entry }));

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const matches = [];
    const nextSlots = [];

    for (let matchIndex = 0; matchIndex < currentSlots.length; matchIndex += 2) {
      const slotA = currentSlots[matchIndex];
      const slotB = currentSlots[matchIndex + 1];
      const matchId = `r${roundIndex + 1}-m${matchIndex / 2 + 1}`;
      const autoWinner =
        slotA?.entry && !slotB?.entry ? slotA
        : !slotA?.entry && slotB?.entry ? slotB
        : null;
      const conflict =
        roundIndex === 0 && slotA?.entry && slotB?.entry && slotA.entry.club === slotB.entry.club
          ? {
              level: "critical",
              reason: "same_club",
              message: "Same-club collision",
            }
          : null;

      matches.push({
        id: matchId,
        round: roundIndex + 1,
        label: roundIndex === 0 ? `Bout ${matchIndex / 2 + 1}` : `Match ${matchIndex / 2 + 1}`,
        sides: [
          {
            name: slotA?.entry?.participantName || (slotA?.sourceMatchId ? `Winner ${slotA.sourceMatchId}` : "Bye"),
            club: slotA?.entry?.club || null,
            nationality: slotA?.entry?.nationality || null,
            seedScore: slotA?.entry?.seedScore || null,
            participantId: slotA?.entry?.participantId || null,
            isBye: !slotA?.entry,
            corner: "red",
          },
          {
            name: slotB?.entry?.participantName || (slotB?.sourceMatchId ? `Winner ${slotB.sourceMatchId}` : "Bye"),
            club: slotB?.entry?.club || null,
            nationality: slotB?.entry?.nationality || null,
            seedScore: slotB?.entry?.seedScore || null,
            participantId: slotB?.entry?.participantId || null,
            isBye: !slotB?.entry,
            corner: "blue",
          },
        ],
        status: autoWinner ? "bye" : roundIndex === 0 ? "scheduled" : "pending",
        conflict,
      });

      nextSlots.push({
        entry: autoWinner?.entry || null,
        sourceMatchId: autoWinner ? null : matchId.toUpperCase(),
        bye: !autoWinner?.entry,
      });
    }

    rounds.push({
      id: `round-${roundIndex + 1}`,
      label: getRoundLabel(roundIndex, totalRounds),
      matches,
    });
    currentSlots = nextSlots;
  }

  const approvedEntries = category.entries.filter((entry) => entry.reviewStatus === ENTRY_STATUS.APPROVED && !entry.invalid);
  return {
    id: `bracket-${category.id}-${presetId}`,
    categoryId: category.id,
    categoryLabel: category.label,
    rulesetLabel: category.rulesetLabel,
    bracketSize: slots.length,
    entryCount: approvedEntries.length,
    seeding: presetId,
    seedingLabel: GENERATION_PRESETS.find((preset) => preset.id === presetId)?.label || presetId,
    status: options.status || "draft",
    rounds,
    generation: {
      presetId,
      summary: evaluation.summary,
      penalties: evaluation.penalties,
      score: evaluation.totalPenalty,
    },
    policy: {
      sameClub: "avoid_if_possible",
      sameCategoryOnly: true,
      fixtureType: approvedEntries.length === 3 ? "round-robin recommended" : "single elimination",
    },
  };
}

function createFixtureSchedule(bracket) {
  if (!bracket) return [];
  const sessions = ["Morning Card", "Prime Card", "Final Block"];
  const cages = ["Cage A", "Cage B"];
  let boutCounter = 1;

  return bracket.rounds.flatMap((round, roundIndex) =>
    round.matches
      .filter((match) => !match.sides.every((side) => side.isBye))
      .map((match, matchIndex) => ({
        id: `${bracket.id}-fixture-${roundIndex + 1}-${matchIndex + 1}`,
        boutNumber: boutCounter++,
        label: match.label,
        roundLabel: round.label,
        session: sessions[Math.min(roundIndex, sessions.length - 1)],
        arena: cages[(roundIndex + matchIndex) % cages.length],
        scheduledAt: `2026-09-12T${String(9 + roundIndex * 2 + matchIndex).padStart(2, "0")}:00:00`,
        categoryLabel: bracket.categoryLabel,
        red: match.sides[0],
        blue: match.sides[1],
        status: match.status === "bye" ? "auto-advance" : match.status,
      }))
  );
}

export function generateBracket(category, options = {}) {
  const approvedEntries = [...category.entries].filter((entry) => entry.reviewStatus === ENTRY_STATUS.APPROVED && !entry.invalid);
  const size = getBracketSize(approvedEntries.length);
  if (!size || approvedEntries.length < 2) return null;

  const presetId = options.seeding || "fair_draw";
  let slots;
  let evaluation;

  if (presetId === "open_draw") {
    slots = getOpenSlots(approvedEntries, size);
    evaluation = evaluateSlots(slots, presetId);
  } else {
    ({ slots, evaluation } = optimizeFairDraw(approvedEntries, size, presetId));
  }

  const bracket = buildBracketFromSlots(category, slots, presetId, evaluation, options);
  return {
    ...bracket,
    fixtures: createFixtureSchedule(bracket),
  };
}

export const TOURNAMENT_PARTICIPANTS = PARTICIPANT_SEEDS.map((participant) => ({
  ...participant,
  age: calculateAge(participant.dob),
}));

export const TOURNAMENT_ENTRIES = buildTournamentEntries(TOURNAMENT_PARTICIPANTS);
export const CATEGORY_REPORT = buildCategoryReport(TOURNAMENT_ENTRIES);
export const TOURNAMENT_OVERVIEW = buildOverview(TOURNAMENT_ENTRIES, CATEGORY_REPORT);
export const DISCIPLINE_SUMMARY = buildDisciplineSummary(TOURNAMENT_ENTRIES, CATEGORY_REPORT);

export const DEFAULT_BRACKETS = CATEGORY_REPORT.filter((category) => category.readyForBracket).reduce((acc, category, index) => {
  const status = index === 0 ? "locked" : index === 1 ? "live" : "draft";
  const preset = index === 0 ? "seeded_championship" : index === 1 ? "fair_draw" : "open_draw";
  acc[category.id] = generateBracket(category, { seeding: preset, status });
  return acc;
}, {});

export const FEATURED_PARTICIPANT = TOURNAMENT_PARTICIPANTS.find((participant) => participant.id === "pt-101");

export function findEntryById(entryId) {
  return TOURNAMENT_ENTRIES.find((entry) => entry.id === entryId);
}

export function findParticipantById(participantId) {
  return TOURNAMENT_PARTICIPANTS.find((participant) => participant.id === participantId);
}

export function findCategoriesByDiscipline(disciplineId) {
  return CATEGORY_REPORT.filter((category) => category.disciplineId === disciplineId);
}

export function advanceBracketWinner(bracket, roundIndex, matchIndex, sideIndex) {
  const rounds = bracket.rounds.map((round) => ({
    ...round,
    matches: round.matches.map((match) => ({
      ...match,
      sides: match.sides.map((side) => ({ ...side })),
    })),
  }));

  const match = rounds[roundIndex]?.matches[matchIndex];
  const winner = match?.sides?.[sideIndex];
  if (!match || !winner || winner.isBye) return bracket;

  match.winnerIndex = sideIndex;
  match.status = roundIndex === rounds.length - 1 ? "completed" : "decided";

  if (roundIndex < rounds.length - 1) {
    const nextMatch = rounds[roundIndex + 1].matches[Math.floor(matchIndex / 2)];
    const nextSideIndex = matchIndex % 2;
    nextMatch.sides[nextSideIndex] = {
      ...winner,
      isBye: false,
    };
    if (nextMatch.sides.every((side) => !side.isBye)) {
      nextMatch.status = "scheduled";
    }
  }

  const nextBracket = {
    ...bracket,
    status: roundIndex === rounds.length - 1 ? "completed" : bracket.status === "draft" ? "live" : bracket.status,
    rounds,
  };
  return {
    ...nextBracket,
    fixtures: createFixtureSchedule(nextBracket),
  };
}

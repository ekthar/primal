// Mock data for TournamentOS — MMA / martial arts tournament platform

import frame020 from "@/assets/veo-frames/020.png";

export const STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  UNDER_REVIEW: "under_review",
  NEEDS_CORRECTION: "needs_correction",
  APPROVED: "approved",
  REJECTED: "rejected",
  SEASON_CLOSED: "season_closed",
};

export const STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  needs_correction: "Needs Correction",
  approved: "Approved",
  rejected: "Rejected",
  season_closed: "Season Closed",
};

export const WEIGHT_CLASSES = [
  { id: "fw", label: "Flyweight", max: 56.7 },
  { id: "bw", label: "Bantamweight", max: 61.2 },
  { id: "ft", label: "Featherweight", max: 65.8 },
  { id: "lw", label: "Lightweight", max: 70.3 },
  { id: "ww", label: "Welterweight", max: 77.1 },
  { id: "mw", label: "Middleweight", max: 83.9 },
  { id: "lh", label: "Light Heavyweight", max: 93.0 },
  { id: "hw", label: "Heavyweight", max: 120.2 },
];

export const DISCIPLINES = [
  "MMA — Full Contact",
  "MMA — Low Contact",
  "Kickboxing — Low Kick",
  "Kickboxing — K-1",
  "Muay Thai",
  "BJJ — Gi",
  "BJJ — No-Gi",
  "Boxing",
];

export const CLUBS = [
  { id: "c1", name: "Sakura Gym", city: "Tokyo, JP", roster: 14 },
  { id: "c2", name: "Apex Combat Club", city: "Montreal, CA", roster: 22 },
  { id: "c3", name: "Legion MMA", city: "São Paulo, BR", roster: 18 },
  { id: "c4", name: "Titan Fight Academy", city: "Warsaw, PL", roster: 9 },
  { id: "c5", name: "Black Flag Muay Thai", city: "Bangkok, TH", roster: 27 },
];

const AVATAR_POOL = [
  "https://images.unsplash.com/photo-1720641424853-36bea6e1682b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTZ8MHwxfHNlYXJjaHwzfHxtYXJ0aWFsJTIwYXJ0cyUyMGZpZ2h0ZXIlMjBwb3J0cmFpdCUyMGJsYWNrJTIwYW5kJTIwd2hpdGV8ZW58MHx8fHwxNzc2NjAzNzM4fDA&ixlib=rb-4.1.0&q=85",
  "https://images.pexels.com/photos/36763067/pexels-photo-36763067.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
];

export const HERO_IMAGE = "/hero-bg.jpeg";
export const TEXTURE_IMAGE = frame020?.src || frame020;

const firstNames = ["Diego", "Aiko", "Marcus", "Lena", "Kofi", "Sasha", "Hiro", "Mina", "Rafael", "Yuki", "Emre", "Priya", "Noah", "Zara", "Ivan", "Olga", "Tariq", "Jade", "Viktor", "Nadia"];
const lastNames = ["Ruiz", "Tanaka", "Okafor", "Ivanov", "Silva", "Kim", "Nakamura", "Patel", "Sato", "Oliveira", "Demir", "Kowalski", "Anderson", "Khan", "Petrov", "Rossi", "Haddad", "Wong", "Dubois", "Abramov"];

function rngFromSeed(seed) {
  let x = Math.sin(seed) * 10000;
  return () => {
    x = Math.sin(x) * 10000;
    return x - Math.floor(x);
  };
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function makeTimeline(rng, status) {
  const base = new Date("2026-02-03T10:12:00");
  const events = [
    { at: new Date(base.getTime() - 8 * 864e5).toISOString(), kind: "draft", label: "Application drafted", actor: "Applicant" },
    { at: new Date(base.getTime() - 5 * 864e5).toISOString(), kind: "submitted", label: "Submitted for review", actor: "Applicant" },
  ];
  if (["under_review", "needs_correction", "approved", "rejected"].includes(status)) {
    events.push({ at: new Date(base.getTime() - 3 * 864e5).toISOString(), kind: "under_review", label: "Picked up for review", actor: "Luca Moretti" });
  }
  if (status === "needs_correction") {
    events.push({ at: new Date(base.getTime() - 2 * 864e5).toISOString(), kind: "needs_correction", label: "Correction requested — medical certificate expired", actor: "Luca Moretti" });
  }
  if (status === "approved") {
    events.push({ at: new Date(base.getTime() - 1 * 864e5).toISOString(), kind: "approved", label: "Approved for weigh-in", actor: "Mei Tanaka" });
  }
  if (status === "rejected") {
    events.push({ at: new Date(base.getTime() - 1 * 864e5).toISOString(), kind: "rejected", label: "Rejected — weight class mismatch", actor: "Mei Tanaka" });
  }
  return events;
}

export function makeFighters(count = 36) {
  const rng = rngFromSeed(42);
  const statuses = Object.values(STATUS);
  const out = [];
  for (let i = 0; i < count; i++) {
    const fn = pick(rng, firstNames);
    const ln = pick(rng, lastNames);
    const weight = Math.round((55 + rng() * 50) * 10) / 10;
    const wc = WEIGHT_CLASSES.find((w) => weight <= w.max) || WEIGHT_CLASSES[WEIGHT_CLASSES.length - 1];
    const status = pick(rng, [STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.UNDER_REVIEW, STATUS.NEEDS_CORRECTION, STATUS.APPROVED, STATUS.DRAFT, STATUS.REJECTED]);
    const club = pick(rng, CLUBS);
    const discipline = pick(rng, DISCIPLINES);
    const wins = Math.floor(rng() * 22);
    const losses = Math.floor(rng() * 8);
    const draws = Math.floor(rng() * 3);
    const age = 18 + Math.floor(rng() * 20);
    out.push({
      id: `f-${1000 + i}`,
      firstName: fn,
      lastName: ln,
      fullName: `${fn} ${ln}`,
      initials: (fn[0] + ln[0]).toUpperCase(),
      avatar: AVATAR_POOL[i % AVATAR_POOL.length],
      clubId: club.id,
      clubName: club.name,
      city: club.city,
      discipline,
      weight,
      weightClass: wc.label,
      weightClassId: wc.id,
      age,
      wins, losses, draws,
      record: `${wins}-${losses}-${draws}`,
      status,
      medicalValid: status !== STATUS.NEEDS_CORRECTION && rng() > 0.15,
      submittedAt: new Date(Date.now() - Math.floor(rng() * 12) * 864e5).toISOString(),
      updatedAt: new Date(Date.now() - Math.floor(rng() * 5) * 3600e3).toISOString(),
      notes: status === STATUS.NEEDS_CORRECTION ? "Medical certificate expired 2026-01-12 — please upload renewed copy." : "",
      timeline: makeTimeline(rng, status),
      flags: status === STATUS.UNDER_REVIEW && rng() > 0.7 ? ["weight-cut"] : [],
    });
  }
  return out;
}

export const FIGHTERS = makeFighters(42);

// Ensure the default club demo (Sakura Gym, c1) has at least one
// "needs_correction" fighter so the Correction Inbox is populated on first load.
(function seedClubInbox() {
  const hasCorrection = FIGHTERS.some((f) => f.clubId === "c1" && f.status === STATUS.NEEDS_CORRECTION);
  if (!hasCorrection) {
    const target = FIGHTERS.find((f) => f.clubId === "c1");
    if (target) {
      target.status = STATUS.NEEDS_CORRECTION;
      target.medicalValid = false;
      target.notes = "Medical certificate expired 2026-01-12 — please upload a renewed copy.";
      target.timeline = [
        ...target.timeline,
        {
          at: new Date(Date.now() - 2 * 864e5).toISOString(),
          kind: "needs_correction",
          label: "Correction requested — medical certificate expired",
          actor: "Luca Moretti",
        },
      ];
    }
  }
})();

export function statusCounts(list = FIGHTERS) {
  return Object.values(STATUS).reduce((acc, s) => {
    acc[s] = list.filter((f) => f.status === s).length;
    return acc;
  }, {});
}

export const APPEALS = [
  { id: "a-01", fighterId: "f-1003", reason: "Disputes weight class assignment — last weigh-in 70.1 kg within LW.", filedAt: "2026-02-01T08:20:00Z", status: "under_review" },
  { id: "a-02", fighterId: "f-1011", reason: "Medical cert was uploaded but flagged as unreadable.", filedAt: "2026-01-30T14:02:00Z", status: "submitted" },
  { id: "a-03", fighterId: "f-1019", reason: "Age verification — official ID was cropped in upload.", filedAt: "2026-01-28T11:45:00Z", status: "approved" },
];

export const REPORT_METRICS = {
  totalApplications: 428,
  approvedRate: 0.71,
  avgReviewHours: 6.2,
  correctionRate: 0.18,
  byWeek: [
    { w: "W48", submitted: 42, approved: 28 },
    { w: "W49", submitted: 58, approved: 39 },
    { w: "W50", submitted: 71, approved: 52 },
    { w: "W51", submitted: 66, approved: 47 },
    { w: "W52", submitted: 80, approved: 61 },
    { w: "W01", submitted: 55, approved: 42 },
    { w: "W02", submitted: 56, approved: 38 },
  ],
  byDiscipline: DISCIPLINES.slice(0, 6).map((d, i) => ({ d, count: 40 + i * 18 })),
};

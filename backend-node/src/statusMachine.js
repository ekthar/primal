// Workflow status constants and transition machine.
// Status model is LOCKED per product spec.

const STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  NEEDS_CORRECTION: 'needs_correction',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SEASON_CLOSED: 'season_closed',
});

const ALL_STATUSES = Object.freeze(Object.values(STATUS));

// Allowed forward transitions per status.
// Keys are `from` statuses; values are Sets of valid `to` statuses.
const TRANSITIONS = Object.freeze({
  [STATUS.DRAFT]:            new Set([STATUS.SUBMITTED]),
  [STATUS.SUBMITTED]:        new Set([STATUS.UNDER_REVIEW, STATUS.NEEDS_CORRECTION, STATUS.REJECTED, STATUS.APPROVED]),
  [STATUS.UNDER_REVIEW]:     new Set([STATUS.NEEDS_CORRECTION, STATUS.APPROVED, STATUS.REJECTED]),
  [STATUS.NEEDS_CORRECTION]: new Set([STATUS.SUBMITTED]), // club resubmits
  [STATUS.APPROVED]:         new Set([STATUS.UNDER_REVIEW]), // only via appeal / audit override
  [STATUS.REJECTED]:         new Set([STATUS.UNDER_REVIEW]), // reopen (appeal granted)
  [STATUS.SEASON_CLOSED]:    new Set([]),
});

/** Who is allowed to cause which transition. */
const TRANSITION_ACTORS = Object.freeze({
  [`${STATUS.DRAFT}->${STATUS.SUBMITTED}`]: ['applicant', 'club', 'admin'],
  [`${STATUS.SUBMITTED}->${STATUS.UNDER_REVIEW}`]: ['reviewer', 'admin'],
  [`${STATUS.SUBMITTED}->${STATUS.NEEDS_CORRECTION}`]: ['reviewer', 'admin'],
  [`${STATUS.SUBMITTED}->${STATUS.REJECTED}`]: ['reviewer', 'admin'],
  [`${STATUS.SUBMITTED}->${STATUS.APPROVED}`]: ['reviewer', 'admin'],
  [`${STATUS.UNDER_REVIEW}->${STATUS.NEEDS_CORRECTION}`]: ['reviewer', 'admin'],
  [`${STATUS.UNDER_REVIEW}->${STATUS.APPROVED}`]: ['reviewer', 'admin'],
  [`${STATUS.UNDER_REVIEW}->${STATUS.REJECTED}`]: ['reviewer', 'admin'],
  [`${STATUS.NEEDS_CORRECTION}->${STATUS.SUBMITTED}`]: ['applicant', 'club'],
  [`${STATUS.APPROVED}->${STATUS.UNDER_REVIEW}`]: ['admin'],
  [`${STATUS.REJECTED}->${STATUS.UNDER_REVIEW}`]: ['admin'],
});

function canTransition(from, to) {
  const set = TRANSITIONS[from];
  return !!(set && set.has(to));
}

function assertTransition(from, to, actorRole) {
  if (!canTransition(from, to)) {
    throw Object.assign(new Error(`Illegal transition ${from} → ${to}`), {
      status: 409,
      code: 'ILLEGAL_TRANSITION',
      details: { from, to },
    });
  }
  const actors = TRANSITION_ACTORS[`${from}->${to}`] || [];
  if (actorRole && !actors.includes(actorRole)) {
    throw Object.assign(new Error(`Role '${actorRole}' cannot transition ${from} → ${to}`), {
      status: 403,
      code: 'FORBIDDEN_TRANSITION',
      details: { from, to, actorRole, allowed: actors },
    });
  }
}

module.exports = { STATUS, ALL_STATUSES, TRANSITIONS, TRANSITION_ACTORS, canTransition, assertTransition };

const Joi = require('joi');
const { ALL_STATUSES } = require('./statusMachine');

const uuid = Joi.string().uuid();
const email = Joi.string().email().lowercase().trim();
const password = Joi.string().min(8).max(200);
const loginPassword = Joi.string().min(1).max(200);
const INDIA = 'India';
const INDIA_PIN_REGEX = /^[1-9][0-9]{5}$/;

const indiaAddressSchema = Joi.object({
  country: Joi.string().valid(INDIA).default(INDIA),
  state: Joi.string().min(2).max(120).required(),
  district: Joi.string().min(2).max(120).required(),
  line1: Joi.string().min(2).max(240).required(),
  line2: Joi.string().max(240).allow(null, ''),
  postalCode: Joi.string().pattern(INDIA_PIN_REGEX).required(),
}).required();

const schemas = {
  auth: {
    register: Joi.object({
      email: email.required(),
      password: password.required(),
      name: Joi.string().min(2).max(120).required(),
      role: Joi.string().valid('applicant', 'club').default('applicant'),
      locale: Joi.string().length(2).default('en'),
    }),
    login: Joi.object({
      email: email.required(),
      password: loginPassword.required(),
    }),
    google: Joi.object({
      idToken: Joi.string().required(),
    }),
    refresh: Joi.object({
      refreshToken: Joi.string().required(),
    }),
    forgotPassword: Joi.object({
      email: email.required(),
    }),
    resetPassword: Joi.object({
      token: Joi.string().required(),
      newPassword: password.required(),
    }),
    adminCreateUser: Joi.object({
      email: email.required(),
      password: password.required(),
      name: Joi.string().min(2).max(120).required(),
      role: Joi.string().valid('admin', 'reviewer', 'state_coordinator', 'club', 'applicant').required(),
      stateCode: Joi.string().min(2).max(120).allow(null, ''),
      locale: Joi.string().length(2).default('en'),
    }).custom((value, helpers) => {
      if (value.role === 'state_coordinator' && !String(value.stateCode || '').trim()) {
        return helpers.error('any.custom', { message: 'stateCode is required for state_coordinator' });
      }
      return value;
    }, 'state coordinator state validation'),
    adminListUsers: Joi.object({
      role: Joi.string().valid('admin', 'reviewer', 'state_coordinator', 'club', 'applicant'),
      stateCode: Joi.string().min(2).max(120).allow(null, ''),
      q: Joi.string().max(200).allow(''),
      limit: Joi.number().integer().min(1).max(200).default(50),
      offset: Joi.number().integer().min(0).default(0),
    }),
  },

  profile: {
    upsert: Joi.object({
      firstName: Joi.string().min(1).max(120).required(),
      lastName: Joi.string().max(120).allow('').required(),
      dateOfBirth: Joi.date().iso().less('now').allow(null),
      gender: Joi.string().max(30).allow(null, ''),
      nationality: Joi.string().valid(INDIA).required(),
      discipline: Joi.string().max(60).allow(null, ''),
      weightKg: Joi.number().positive().max(300).allow(null),
      weightClass: Joi.string().max(60).allow(null, ''),
      recordWins: Joi.number().integer().min(0).default(0),
      recordLosses: Joi.number().integer().min(0).default(0),
      recordDraws: Joi.number().integer().min(0).default(0),
      bio: Joi.string().max(2000).allow(null, ''),
      clubId: uuid.allow(null),
      metadata: Joi.object({
        selectedDisciplines: Joi.array().items(Joi.string().max(80)).default([]),
        experienceLevel: Joi.string().max(80).allow(null, ''),
        phone: Joi.string().max(30).allow(null, ''),
        address: indiaAddressSchema,
      }).unknown(true).required(),
    }),
    adminReweighList: Joi.object({
      tournamentId: uuid,
      clubId: uuid,
      q: Joi.string().max(200).allow(''),
      limit: Joi.number().integer().min(1).max(500).default(200),
      offset: Joi.number().integer().min(0).default(0),
    }),
    adminReweigh: Joi.object({
      weightKg: Joi.number().positive().max(300).required(),
    }),
  },

  tournament: {
    adminList: Joi.object({
      q: Joi.string().max(200).allow(''),
      includeArchived: Joi.boolean().default(false),
      limit: Joi.number().integer().min(1).max(500).default(200),
      offset: Joi.number().integer().min(0).default(0),
    }),
    adminCreate: Joi.object({
      name: Joi.string().min(3).max(160).required(),
      slug: Joi.string()
        .pattern(/^[a-z0-9-]+$/)
        .min(2)
        .max(80)
        .required()
        .messages({
          'string.pattern.base': 'slug may only contain lowercase letters, digits, and hyphens',
        }),
      season: Joi.string().max(80).allow(null, ''),
      registrationOpenAt: Joi.date().iso().allow(null),
      registrationCloseAt: Joi.date().iso().allow(null),
      correctionWindowHours: Joi.number().integer().min(1).max(720).allow(null),
      startsOn: Joi.date().iso().allow(null),
      endsOn: Joi.date().iso().allow(null),
      isPublic: Joi.boolean().default(true),
    }).custom((value, helpers) => {
      if (value.registrationOpenAt && value.registrationCloseAt && new Date(value.registrationOpenAt) > new Date(value.registrationCloseAt)) {
        return helpers.message({ custom: 'registrationOpenAt must be before registrationCloseAt' });
      }
      return value;
    }, 'registration window validation'),
    adminUpdate: Joi.object({
      name: Joi.string().min(3).max(160),
      slug: Joi.string()
        .pattern(/^[a-z0-9-]+$/)
        .min(2)
        .max(80)
        .messages({
          'string.pattern.base': 'slug may only contain lowercase letters, digits, and hyphens',
        }),
      season: Joi.string().max(80).allow(null, ''),
      registrationOpenAt: Joi.date().iso().allow(null),
      registrationCloseAt: Joi.date().iso().allow(null),
      correctionWindowHours: Joi.number().integer().min(1).max(720).allow(null),
      startsOn: Joi.date().iso().allow(null),
      endsOn: Joi.date().iso().allow(null),
      isPublic: Joi.boolean(),
    }).min(1).custom((value, helpers) => {
      if (value.registrationOpenAt && value.registrationCloseAt) {
        if (new Date(value.registrationOpenAt) > new Date(value.registrationCloseAt)) {
          return helpers.message({ custom: 'registrationOpenAt must be before registrationCloseAt' });
        }
      }
      return value;
    }, 'registration window validation'),
    adminDelete: Joi.object({}),
  },

  bracket: {
    overview: Joi.object({
      tournamentId: uuid,
    }),
    generate: Joi.object({
      tournamentId: uuid.allow(null),
      categoryId: Joi.string().min(3).max(240).required(),
      seeding: Joi.string().valid('fair_draw', 'seeded_championship', 'open_draw').required(),
    }),
    advance: Joi.object({
      roundIndex: Joi.number().integer().min(0).required(),
      matchIndex: Joi.number().integer().min(0).required(),
      sideIndex: Joi.number().integer().valid(0, 1).required(),
    }),
    update: Joi.object({
      status: Joi.string().valid('draft', 'locked', 'live', 'completed').required(),
    }),
  },

  division: {
    list: Joi.object({}),
    sync: Joi.object({}),
    generateBracket: Joi.object({
      force: Joi.boolean().default(false),
    }),
    manualSeeds: Joi.object({
      seeds: Joi.array().items(
        Joi.object({
          entryId: uuid.required(),
          seed: Joi.number().integer().min(1).required(),
        })
      ).required(),
    }),
  },

  match: {
    result: Joi.object({
      winnerEntryId: uuid.required(),
      method: Joi.string().valid('KO', 'TKO', 'SUB', 'DEC', 'DQ', 'NC').required(),
      resultRound: Joi.number().integer().min(1).max(20).required(),
      resultTime: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
    }),
  },

  club: {
    create: Joi.object({
      name: Joi.string().min(2).max(120).required(),
      slug: Joi.string().pattern(/^[a-z0-9-]+$/).min(2).max(80).required(),
      city: Joi.string().max(120).allow(null, ''),
      country: Joi.string().valid(INDIA).default(INDIA),
      metadata: Joi.object().default({}),
    }),
    update: Joi.object({
      name: Joi.string().min(2).max(120),
      city: Joi.string().max(120).allow(null, ''),
      country: Joi.string().valid(INDIA),
      status: Joi.string().valid('pending', 'active', 'suspended'),
      metadata: Joi.object(),
    }).min(1),
    listParticipants: Joi.object({
      q: Joi.string().max(200).allow(''),
      limit: Joi.number().integer().min(1).max(200).default(100),
      offset: Joi.number().integer().min(0).default(0),
    }),
    createParticipant: Joi.object({
      email: email.required(),
      fullName: Joi.string().min(2).max(120).required(),
      phone: Joi.string().max(30).allow(null, ''),
      dateOfBirth: Joi.date().iso().less('now').allow(null),
      gender: Joi.string().max(30).allow(null, ''),
      discipline: Joi.string().max(60).allow(null, ''),
      selectedDisciplines: Joi.array().items(Joi.string().max(120)).max(20).default([]),
      weightKg: Joi.number().positive().max(300).allow(null),
      weightClass: Joi.string().max(60).allow(null, ''),
      bio: Joi.string().max(2000).allow(null, ''),
      address: indiaAddressSchema,
      sendResetLink: Joi.boolean().default(true),
    }),
    updateParticipant: Joi.object({
      fullName: Joi.string().min(2).max(120).required(),
      phone: Joi.string().max(30).allow(null, ''),
      dateOfBirth: Joi.date().iso().less('now').allow(null),
      gender: Joi.string().max(30).allow(null, ''),
      discipline: Joi.string().max(60).allow(null, ''),
      selectedDisciplines: Joi.array().items(Joi.string().max(120)).max(20).default([]),
      weightKg: Joi.number().positive().max(300).allow(null),
      weightClass: Joi.string().max(60).allow(null, ''),
      bio: Joi.string().max(2000).allow(null, ''),
      address: indiaAddressSchema,
    }),
  },

  application: {
    create: Joi.object({
      tournamentId: uuid.required(),
      profileId: uuid,                         // admin/club may create on behalf
      formData: Joi.object().default({}),
    }),
    update: Joi.object({
      formData: Joi.object(),
    }).min(1),
    submit: Joi.object({
      confirm: Joi.boolean().valid(true).required(),
    }),
    bulk: Joi.object({
      ids: Joi.array().items(uuid).min(1).max(500).required(),
    }),
    cancelRequest: Joi.object({
      reason: Joi.string().min(10).max(2000).required(),
    }),
    reapply: Joi.object({
      tournamentId: uuid.required(),
    }),
  },

  review: {
    assign: Joi.object({
      reviewerId: uuid.required(),
    }),
    decision: Joi.object({
      action: Joi.string().valid('approve', 'reject', 'request_correction').required(),
      reason: Joi.string().max(2000).when('action', { is: Joi.not('approve'), then: Joi.required() }),
      fields: Joi.array().items(Joi.string().max(80)).when('action', {
        is: 'request_correction',
        then: Joi.array().min(1).required(),
        otherwise: Joi.optional(),
      }),
    }),
    bulkDecision: Joi.object({
      ids: Joi.array().items(uuid).min(1).max(500).required(),
      action: Joi.string().valid('approve', 'reject', 'request_correction').required(),
      reason: Joi.string().max(2000).when('action', {
        is: Joi.valid('request_correction', 'reject'),
        then: Joi.required(),
      }),
      fields: Joi.array().items(Joi.string().max(80)).when('action', {
        is: 'request_correction',
        then: Joi.array().min(1).required(),
      }),
    }),
    reopen: Joi.object({
      reason: Joi.string().min(3).max(2000).required(),
    }),
  },

  appeal: {
    create: Joi.object({
      applicationId: uuid.required(),
      reason: Joi.string().min(10).max(4000).required(),
    }),
    decide: Joi.object({
      action: Joi.string().valid('grant', 'deny').required(),
      panelDecision: Joi.string().max(4000).required(),
    }),
  },

  queue: {
    list: Joi.object({
      status: Joi.string().valid(...ALL_STATUSES, 'all').default('all'),
      tournamentId: uuid,
      clubId: uuid,
      reviewerId: uuid,
      stateCode: Joi.string().min(2).max(120).allow(null, ''),
      overdue: Joi.boolean(),
      dueSoon: Joi.boolean(),
      q: Joi.string().max(200).allow(''),
      limit: Joi.number().integer().min(1).max(200).default(50),
      offset: Joi.number().integer().min(0).default(0),
    }),
  },

  document: {
    create: Joi.object({
      kind: Joi.string().max(80).required(),
      label: Joi.string().max(200).allow(null, ''),
      expiresOn: Joi.date().iso().allow(null),
      capturedVia: Joi.string().valid('upload', 'scan', 'admin_rescan').allow(null, ''),
      idNumberLast4: Joi.string().pattern(/^[0-9A-Za-z]{4}$/).allow(null, ''),
    }),
    verify: Joi.object({
      verified: Joi.boolean().required(),
      reason: Joi.string().max(500).allow(null, ''),
    }),
  },

  circulars: {
    create: Joi.object({
      title: Joi.string().min(3).max(200).required(),
      subtitle: Joi.string().max(240).allow(null, ''),
      kind: Joi.string().valid('registration', 'window', 'rules', 'notice').default('notice'),
      body: Joi.string().max(12000).allow('').default(''),
      coverImageUrl: Joi.string().uri().allow(null, ''),
      ctaLabel: Joi.string().max(40).allow(null, ''),
      ctaUrl: Joi.string().uri().allow(null, ''),
      pinned: Joi.boolean().default(false),
      isPublished: Joi.boolean().default(false),
      publishedAt: Joi.date().iso().allow(null),
      showFrom: Joi.date().iso().allow(null),
      showUntil: Joi.date().iso().allow(null),
    }).custom((val, helpers) => {
      if (val.showFrom && val.showUntil && new Date(val.showFrom) > new Date(val.showUntil)) {
        return helpers.error('any.invalid');
      }
      return val;
    }, 'date range'),

    update: Joi.object({
      title: Joi.string().min(3).max(200),
      subtitle: Joi.string().max(240).allow(null, ''),
      kind: Joi.string().valid('registration', 'window', 'rules', 'notice'),
      body: Joi.string().max(12000).allow(''),
      coverImageUrl: Joi.string().uri().allow(null, ''),
      ctaLabel: Joi.string().max(40).allow(null, ''),
      ctaUrl: Joi.string().uri().allow(null, ''),
      pinned: Joi.boolean(),
      isPublished: Joi.boolean(),
      publishedAt: Joi.date().iso().allow(null),
      showFrom: Joi.date().iso().allow(null),
      showUntil: Joi.date().iso().allow(null),
    }).min(1).custom((val, helpers) => {
      const from = val.showFrom ? new Date(val.showFrom) : null;
      const until = val.showUntil ? new Date(val.showUntil) : null;
      if (from && until && from > until) return helpers.error('any.invalid');
      return val;
    }, 'date range'),

    listAdmin: Joi.object({
      q: Joi.string().max(200).allow(''),
      kind: Joi.string().valid('registration', 'window', 'rules', 'notice'),
      published: Joi.string().valid('true', 'false', 'all').default('all'),
      limit: Joi.number().integer().min(1).max(200).default(50),
      offset: Joi.number().integer().min(0).default(0),
    }),

    listPublic: Joi.object({
      kind: Joi.string().valid('registration', 'window', 'rules', 'notice'),
      limit: Joi.number().integer().min(1).max(50).default(12),
    }),
  },
};

module.exports = { schemas };

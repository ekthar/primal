const databaseUrl = process.env.DATABASE_URL || '';
const dbHost = process.env.PGHOST || '';
const likelyCloudPostgres = /postgres\.database\.azure\.com|(^|\.)neon\.tech|(^|\.)aws\.neon\.tech/i.test(`${databaseUrl} ${dbHost}`);
const urlRequiresSsl = /sslmode=require/i.test(databaseUrl);

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:4000',
  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:3000',
  corsOrigins: String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  db: {
    url: databaseUrl || undefined,
    host: dbHost || undefined,
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: /^true$/i.test(process.env.PG_SSL || '') || urlRequiresSsl || likelyCloudPostgres,
    sslRejectUnauthorized: /^true$/i.test(process.env.PG_SSL_REJECT_UNAUTHORIZED || ''),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '30d',
    passwordResetTtl: process.env.JWT_PASSWORD_RESET_TTL || '30m',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  notifications: {
    resendKey: process.env.RESEND_API_KEY || '',
    resendFrom: process.env.RESEND_FROM || 'Primal <no-reply@primalfight.io>',
    resendRetries: parseInt(process.env.RESEND_RETRIES || '2', 10),
    twilioSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioToken: process.env.TWILIO_AUTH_TOKEN || '',
    smsFrom: process.env.TWILIO_SMS_FROM || '',
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
  },

  workflow: {
    correctionWindowHours: parseInt(process.env.CORRECTION_WINDOW_HOURS || '72', 10),
    reviewSlaHours: parseInt(process.env.REVIEW_SLA_HOURS || '48', 10),
    appealWindowDays: parseInt(process.env.APPEAL_WINDOW_DAYS || '14', 10),
  },

  pdf: {
    brandName: process.env.PDF_BRAND_NAME || 'Primal',
    // Phase 0 (Primal OS) — unified federation palette.
    //   paper  near-white, toner-friendly
    //   ink    structure + body text
    //   accent Primal ink-red, used for status + verification accents
    paper: process.env.PDF_PAPER || '#FAFAF7',
    ink: process.env.PDF_INK || '#0A0A0A',
    brandPrimary: process.env.PDF_BRAND_PRIMARY || '#0A0A0A',
    brandAccent: process.env.PDF_BRAND_ACCENT || '#7A1E22',
    logoPath: process.env.PDF_LOGO_PATH || './assets/primal.png',
    fontBodyPath: process.env.PDF_FONT_BODY_PATH || './assets/fonts/InterTight-Regular.ttf',
    fontBodyBoldPath: process.env.PDF_FONT_BODY_BOLD_PATH || './assets/fonts/InterTight-SemiBold.ttf',
    fontHeadingPath: process.env.PDF_FONT_HEADING_PATH || './assets/fonts/Manrope-SemiBold.ttf',
    fontHeadingBoldPath: process.env.PDF_FONT_HEADING_BOLD_PATH || './assets/fonts/Manrope-Bold.ttf',
    signatureSecret: process.env.PDF_SIGNATURE_SECRET || process.env.JWT_SECRET || 'dev-only-change-me',
    verifyBaseUrl: process.env.PDF_VERIFY_BASE_URL || `${process.env.APP_BASE_URL || 'http://localhost:4000'}/api/public/verify/application-signature`,
  },

  uploadDir: process.env.UPLOAD_DIR || './uploads',
  // Auto-flip to vercel-blob when the token is present so the operator only
  // needs to set BLOB_READ_WRITE_TOKEN to activate persistent storage.
  uploadStorageProvider: process.env.UPLOAD_STORAGE_PROVIDER
    || (process.env.BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : 'local'),
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '10', 10),
  observability: {
    slowQueryMs: parseInt(process.env.SLOW_QUERY_MS || '250', 10),
  },
  blob: {
    readWriteToken: process.env.BLOB_READ_WRITE_TOKEN || '',
    access: process.env.BLOB_ACCESS || 'public',
  },
};

function getProductionReadiness() {
  const checks = [
    {
      key: 'jwtSecret',
      ok: config.jwt.secret && config.jwt.secret !== 'dev-only-change-me',
      message: 'JWT secret configured',
    },
    {
      key: 'appBaseUrl',
      ok: /^https?:\/\//.test(config.appBaseUrl),
      message: 'App base URL configured',
    },
    {
      key: 'webBaseUrl',
      ok: /^https?:\/\//.test(config.webBaseUrl),
      message: 'Web base URL configured',
    },
    {
      key: 'resend',
      ok: Boolean(config.notifications.resendKey && config.notifications.resendFrom),
      message: 'Resend email provider configured',
    },
    {
      key: 'pdfSignature',
      ok: Boolean(config.pdf.signatureSecret),
      message: 'PDF signature secret configured',
    },
    {
      key: 'pdfVerifyUrl',
      ok: Boolean(config.pdf.verifyBaseUrl),
      message: 'PDF verification URL configured',
    },
  ];

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

function validateProductionConfig() {
  if (config.env !== 'production') return;
  const readiness = getProductionReadiness();
  const failedChecks = readiness.checks.filter((check) => !check.ok);
  if (!failedChecks.length) return;
  const error = new Error(`Missing production configuration: ${failedChecks.map((check) => check.key).join(', ')}`);
  error.code = 'INVALID_PRODUCTION_CONFIG';
  throw error;
}

module.exports = { config, getProductionReadiness, validateProductionConfig };

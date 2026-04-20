const databaseUrl = process.env.DATABASE_URL || '';
const dbHost = process.env.PGHOST || '';
const likelyCloudPostgres = /postgres\.database\.azure\.com|(^|\.)neon\.tech|(^|\.)aws\.neon\.tech/i.test(`${databaseUrl} ${dbHost}`);
const urlRequiresSsl = /sslmode=require/i.test(databaseUrl);

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:4000',
  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:3000',

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
    resendFrom: process.env.RESEND_FROM || 'TournamentOS <no-reply@tournamentos.io>',
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
    brandPrimary: process.env.PDF_BRAND_PRIMARY || '#0b0b0b',
    brandAccent: process.env.PDF_BRAND_ACCENT || '#ef1a1a',
    logoPath: process.env.PDF_LOGO_PATH || './assets/primal-logo.png',
    fontBodyPath: process.env.PDF_FONT_BODY_PATH || './assets/fonts/InterTight-Regular.ttf',
    fontBodyBoldPath: process.env.PDF_FONT_BODY_BOLD_PATH || './assets/fonts/InterTight-SemiBold.ttf',
    fontHeadingPath: process.env.PDF_FONT_HEADING_PATH || './assets/fonts/Manrope-SemiBold.ttf',
    fontHeadingBoldPath: process.env.PDF_FONT_HEADING_BOLD_PATH || './assets/fonts/Manrope-Bold.ttf',
    signatureSecret: process.env.PDF_SIGNATURE_SECRET || process.env.JWT_SECRET || 'dev-only-change-me',
    verifyBaseUrl: process.env.PDF_VERIFY_BASE_URL || `${process.env.APP_BASE_URL || 'http://localhost:4000'}/api/public/verify/application-signature`,
  },

  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB || '10', 10),
};

module.exports = { config };

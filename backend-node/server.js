require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { config, validateProductionConfig } = require('./src/config');
const { logger } = require('./src/logger');
const { errorHandler, notFound } = require('./src/middleware');

// Route modules
const authRoutes = require('./src/routes/auth.routes');
const profileRoutes = require('./src/routes/profile.routes');
const clubRoutes = require('./src/routes/club.routes');
const applicationRoutes = require('./src/routes/application.routes');
const reviewRoutes = require('./src/routes/review.routes');
const queueRoutes = require('./src/routes/queue.routes');
const appealRoutes = require('./src/routes/appeal.routes');
const reportRoutes = require('./src/routes/report.routes');
const auditRoutes = require('./src/routes/audit.routes');
const publicRoutes = require('./src/routes/public.routes');
const circularRoutes = require('./src/routes/circular.routes');
const tournamentRoutes = require('./src/routes/tournament.routes');
const bracketRoutes = require('./src/routes/bracket.routes');
const divisionRoutes = require('./src/routes/division.routes');
const matchRoutes = require('./src/routes/match.routes');
const albumRoutes = require('./src/routes/album.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const weighinRoutes = require('./src/routes/weighin.routes');
const webhookRoutes = require('./src/routes/webhook.routes');

const app = express();

validateProductionConfig();

const configuredCorsOrigins = Array.from(new Set([
  ...config.corsOrigins,
  config.webBaseUrl,
])).filter(Boolean);

const corsDelegate = (req, callback) => {
  const requestOrigin = req.header('Origin');
  if (!requestOrigin) {
    callback(null, { origin: true, credentials: true });
    return;
  }
  if (!configuredCorsOrigins.length) {
    callback(null, { origin: true, credentials: true });
    return;
  }
  const allowed = configuredCorsOrigins.includes(requestOrigin);
  callback(null, {
    origin: allowed,
    credentials: true,
  });
};

app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Disable X-Frame-Options so the frontend on Vercel can embed PDFs/images served
  // from this API in an <iframe> (e.g. document verification preview).
  frameguard: false,
  contentSecurityPolicy: false,
}));
app.use(cors(corsDelegate));
app.options('*', cors(corsDelegate));
app.use(express.json({ limit: `${config.maxUploadMb}mb` }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// Serve local uploads (replace with S3/CDN in prod)
app.use('/uploads', express.static(path.resolve(config.uploadDir)));

// Basic rate-limit on auth surface
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString(), env: config.env }));

// Mount API
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/appeals', appealRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/circulars', circularRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/brackets', bracketRoutes);
app.use('/api/divisions', divisionRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/weigh-ins', weighinRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/public', publicRoutes);

app.use(notFound);
app.use(errorHandler);

const port = config.port;
if (require.main === module) {
  app.listen(port, () => logger.info({ port, env: config.env }, 'TournamentOS API ready'));
}

module.exports = app;

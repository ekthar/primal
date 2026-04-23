require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { config } = require('./src/config');
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

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: true, credentials: true }));
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
app.use('/api/public', publicRoutes);

app.use(notFound);
app.use(errorHandler);

const port = config.port;
if (require.main === module) {
  app.listen(port, () => logger.info({ port, env: config.env }, 'TournamentOS API ready'));
}

module.exports = app;

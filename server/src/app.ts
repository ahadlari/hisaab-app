import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import pinoHttp from 'pino-http';
import { config } from './config';
import prisma from './config/db';
import { logger } from './utils/logger';
import { errorMiddleware } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import roomRoutes from './routes/room.routes';
import expenseRoutes from './routes/expense.routes';
import settlementRoutes from './routes/settlement.routes';
import memberRoutes from './routes/member.routes';

// Patch BigInt serialization for JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();

// Initialize Sentry
if (config.nodeEnv === 'production' || config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    integrations: [
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0, 
    profilesSampleRate: 1.0,
  });
}

// Middleware
app.use(helmet()); // Security headers
app.use(compression()); // GZIP compression

// Rate Limiting (100 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(pinoHttp({ logger }));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/rooms', roomRoutes);
app.use('/api/v1/rooms', expenseRoutes);
app.use('/api/v1/rooms', settlementRoutes);
app.use('/api/v1/rooms', memberRoutes);

// Health check
app.get('/api/v1/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString(), db: 'connected' });
  } catch (error) {
    logger.error({ err: error }, 'Health check failed: DB unreachable');
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString(), db: 'disconnected' });
  }
});

// 404 handler for unknown API routes
app.use((_req, res, _next) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found' } });
});

// Sentry error handler must be before any other error middleware
if (config.nodeEnv === 'production' || config.sentryDsn) {
  Sentry.setupExpressErrorHandler(app);
}

// Error handling (must be last)
app.use(errorMiddleware);

export default app;

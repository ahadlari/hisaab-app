import express from 'express';
import cors from 'cors';
import { config } from './config';
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

// Middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/rooms', roomRoutes);
app.use('/api/v1/rooms', expenseRoutes);
app.use('/api/v1/rooms', settlementRoutes);
app.use('/api/v1/rooms', memberRoutes);

// Health check
app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling (must be last)
app.use(errorMiddleware);

export default app;

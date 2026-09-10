import { Request, Response, NextFunction } from 'express';

/**
 * Global error handling middleware.
 * Returns the standard error response shape defined in doc 04 §1.
 */
export function errorMiddleware(
  err: Error & { statusCode?: number; code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('[Error]', err.message, err.stack);

  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    error: { code, message },
  });
}

/**
 * Custom error class with status code.
 */
export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'AppError';
  }
}

import { z } from 'zod';

// ─────────────────────────────────────────────
// Settlement Validators (Zod schemas)
// ─────────────────────────────────────────────

export const createSettlementSchema = z.object({
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  amountPaise: z.number().int().positive('Settlement amount must be positive'),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'OTHER']).optional().default('OTHER'),
  proofUrl: z.string().url().optional(),
  note: z.string().max(500).optional(),
});

export const editSettlementSchema = z.object({
  amountPaise: z.number().int().positive().optional(),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'OTHER']).optional(),
  note: z.string().max(500).optional(),
  reason: z.string().max(255).optional(),
});

export const cancelSettlementSchema = z.object({
  reason: z.string().max(255).optional(),
});

export const verifySettlementSchema = z.object({
  status: z.enum(['CONFIRMED', 'REJECTED']),
  reason: z.string().max(255).optional(),
});

export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
export type EditSettlementInput = z.infer<typeof editSettlementSchema>;
export type CancelSettlementInput = z.infer<typeof cancelSettlementSchema>;
export type VerifySettlementInput = z.infer<typeof verifySettlementSchema>;

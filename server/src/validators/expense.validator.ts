import { z } from 'zod';

// ─────────────────────────────────────────────
// Expense Validators (Zod schemas)
// ─────────────────────────────────────────────

const paymentSchema = z.object({
  payerId: z.string().uuid(),
  amountPaise: z.number().int().positive('Payment amount must be positive'),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'OTHER']).optional().default('OTHER'),
});

const participantBaseSchema = z.object({
  userId: z.string().uuid(),
});

const equalParticipant = participantBaseSchema;

const customParticipant = participantBaseSchema.extend({
  customAmountPaise: z.number().int().nonnegative('Custom amount cannot be negative'),
});

const percentageParticipant = participantBaseSchema.extend({
  percentage: z.number().min(0).max(100),
});

const shareBasedParticipant = participantBaseSchema.extend({
  shareUnits: z.number().int().nonnegative('Share units cannot be negative'),
});

export const createExpenseSchema = z.object({
  description: z.string().min(1, 'Description is required').max(255),
  amountPaise: z.number().int().positive('Amount must be positive'),
  categoryId: z.string().uuid().nullable().optional(),
  expenseDate: z.string().datetime().optional(),
  splitType: z.enum(['EQUAL', 'CUSTOM_AMOUNT', 'PERCENTAGE', 'SHARE_BASED']),
  payments: z.array(paymentSchema).min(1, 'At least one payment is required'),
  participants: z.array(z.union([equalParticipant, customParticipant, percentageParticipant, shareBasedParticipant]))
    .min(1, 'At least one participant is required'),
  note: z.string().max(500).optional(),
});

export const editExpenseSchema = z.object({
  description: z.string().min(1).max(255).optional(),
  amountPaise: z.number().int().positive().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  expenseDate: z.string().datetime().optional(),
  splitType: z.enum(['EQUAL', 'CUSTOM_AMOUNT', 'PERCENTAGE', 'SHARE_BASED']).optional(),
  payments: z.array(paymentSchema).min(1).optional(),
  participants: z.array(z.union([equalParticipant, customParticipant, percentageParticipant, shareBasedParticipant]))
    .min(1).optional(),
  note: z.string().max(500).optional(),
  reason: z.string().max(255).optional(),
});

export const voidExpenseSchema = z.object({
  reason: z.string().max(255).optional(),
  force: z.boolean().optional().default(false),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type EditExpenseInput = z.infer<typeof editExpenseSchema>;
export type VoidExpenseInput = z.infer<typeof voidExpenseSchema>;

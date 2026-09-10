import { Router } from 'express';
import {
  createExpense,
  getExpenses,
  getExpenseById,
  editExpense,
  voidExpense,
} from '../controllers/expense.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createExpenseSchema, editExpenseSchema, voidExpenseSchema } from '../validators/expense.validator';

const router = Router();

router.use(authMiddleware);

router.post('/:roomId/expenses', validate(createExpenseSchema), createExpense);
router.get('/:roomId/expenses', getExpenses);
router.get('/:roomId/expenses/:expenseId', getExpenseById);
router.patch('/:roomId/expenses/:expenseId', validate(editExpenseSchema), editExpense);
router.post('/:roomId/expenses/:expenseId/void', validate(voidExpenseSchema), voidExpense);

export default router;

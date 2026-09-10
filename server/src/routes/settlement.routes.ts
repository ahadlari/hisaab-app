import { Router } from 'express';
import {
  createSettlement,
  getSettlements,
  editSettlement,
  cancelSettlement,
  verifySettlement,
} from '../controllers/settlement.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { createSettlementSchema, editSettlementSchema, cancelSettlementSchema, verifySettlementSchema } from '../validators/settlement.validator';

const router = Router();

router.use(authMiddleware);

router.get('/:roomId/settlements', getSettlements);
router.post('/:roomId/settlements', validate(createSettlementSchema), createSettlement);
router.patch('/:roomId/settlements/:settlementId', validate(editSettlementSchema), editSettlement);
router.patch('/:roomId/settlements/:settlementId/verify', validate(verifySettlementSchema), verifySettlement);
router.post('/:roomId/settlements/:settlementId/cancel', validate(cancelSettlementSchema), cancelSettlement);

export default router;

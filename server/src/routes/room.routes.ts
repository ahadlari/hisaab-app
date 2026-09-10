import { Router } from 'express';
import {
  createRoom,
  joinRoom,
  getUserRooms,
  getRoomDetails,
  updateRoom,
  getRoomBalances,
  getMonthlySummary,
  getCategories,
  createCategory,
  getDefaultRules,
  updateDefaultRules,
  getAuditLog,
} from '../controllers/room.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All room routes require auth
router.use(authMiddleware);

router.post('/', createRoom);
router.post('/join', joinRoom);
router.get('/', getUserRooms);
router.get('/:roomId', getRoomDetails);
router.patch('/:roomId', updateRoom);
router.get('/:roomId/balances', getRoomBalances);
router.get('/:roomId/summary', getMonthlySummary);
router.get('/:roomId/categories', getCategories);
router.post('/:roomId/categories', createCategory);
router.get('/:roomId/default-rules', getDefaultRules);
router.put('/:roomId/default-rules', updateDefaultRules);
router.get('/:roomId/audit-log', getAuditLog);

export default router;

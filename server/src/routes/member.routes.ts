import { Router } from 'express';
import { removeMember } from '../controllers/member.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/:roomId/members/:userId/remove', removeMember);

export default router;

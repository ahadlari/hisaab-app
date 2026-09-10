import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';
import * as roomService from '../services/room.service';
import { createAuditLog } from '../services/audit.service';

/**
 * Remove a member from a room (admin only).
 * Returns 409 if member has non-zero outstanding balance, unless force=true.
 */
export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { roomId, userId: targetUserId } = req.params;
    const requesterId = req.userId!;

    // Check admin
    const isAdmin = await roomService.isRoomAdmin(roomId, requesterId);
    if (!isAdmin) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only admins can remove members' } });
      return;
    }

    // Check member exists
    const member = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
    });
    if (!member || member.status === 'INACTIVE') {
      res.status(404).json({ error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found or already removed' } });
      return;
    }

    // Check outstanding balance (unless force=true)
    if (!req.body.force) {
      const { balances } = await roomService.getRoomBalances(roomId);
      const memberBalance = balances.find(b => b.userId === targetUserId);
      if (memberBalance && memberBalance.outstandingPaise !== 0n) {
        res.status(409).json({
          error: {
            code: 'MEMBER_HAS_OUTSTANDING_BALANCE',
            message: `Member still has an outstanding balance of ₹${Math.abs(Number(memberBalance.outstandingPaise)) / 100}.`,
            details: { outstandingPaise: Number(memberBalance.outstandingPaise) },
          },
        });
        return;
      }
    }

    // Mark as inactive
    await prisma.$transaction(async (tx) => {
      await tx.roomMember.update({
        where: { id: member.id },
        data: { status: 'INACTIVE', leftAt: new Date() },
      });

      await createAuditLog({
        roomId,
        userId: requesterId,
        action: 'MEMBER_LEFT',
        entityType: 'RoomMember',
        entityId: member.id,
        oldData: { userId: targetUserId, status: 'ACTIVE' },
        newData: { userId: targetUserId, status: 'INACTIVE' },
      }, tx);
    });

    res.json({ data: { userId: targetUserId, status: 'INACTIVE' } });
  } catch (error) {
    next(error);
  }
}

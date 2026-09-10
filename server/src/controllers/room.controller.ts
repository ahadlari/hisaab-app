import { Request, Response, NextFunction } from 'express';
import * as roomService from '../services/room.service';

export async function createRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Room name is required' } });
      return;
    }
    const room = await roomService.createRoom(req.userId!, name);
    res.status(201).json({ data: room });
  } catch (error) {
    next(error);
  }
}

export async function joinRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invite code is required' } });
      return;
    }
    const result = await roomService.joinRoom(req.userId!, inviteCode);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getUserRooms(req: Request, res: Response, next: NextFunction) {
  try {
    const rooms = await roomService.getUserRooms(req.userId!);
    res.json({ data: rooms });
  } catch (error) {
    next(error);
  }
}

export async function getRoomDetails(req: Request, res: Response, next: NextFunction) {
  try {
    const room = await roomService.getRoomDetails(req.params.roomId);
    res.json({ data: room });
  } catch (error) {
    next(error);
  }
}

export async function updateRoom(req: Request, res: Response, next: NextFunction) {
  try {
    const isAdmin = await roomService.isRoomAdmin(req.params.roomId, req.userId!);
    if (!isAdmin) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only admins can update room settings' } });
      return;
    }
    const room = await roomService.updateRoom(req.params.roomId, req.body);
    res.json({ data: room });
  } catch (error) {
    next(error);
  }
}

export async function getRoomBalances(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await roomService.getRoomBalances(req.params.roomId);
    
    // Serialize BigInt values for JSON
    res.json({
      data: {
        balances: result.balances.map(b => ({
          userId: b.userId,
          name: b.name,
          outstandingPaise: Number(b.outstandingPaise),
        })),
        suggestedSettlements: result.suggestedSettlements.map(s => ({
          fromUserId: s.fromUserId,
          toUserId: s.toUserId,
          amountPaise: Number(s.amountPaise),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMonthlySummary(req: Request, res: Response, next: NextFunction) {
  try {
    const month = req.query.month as string;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Month parameter required in YYYY-MM format' } });
      return;
    }
    const summary = await roomService.getMonthlySummary(req.params.roomId, month);
    
    res.json({
      data: {
        ...summary,
        totalExpensesPaise: Number(summary.totalExpensesPaise),
        categoryBreakdown: summary.categoryBreakdown.map(c => ({
          category: c.category,
          totalPaise: Number(c.totalPaise),
        })),
        balancesAtMonthEnd: summary.balancesAtMonthEnd.map(b => ({
          userId: b.userId,
          name: b.name,
          outstandingPaise: Number(b.outstandingPaise),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const { default: prisma } = await import('../config/db');
    const categories = await prisma.roomCategory.findMany({
      where: { roomId: req.params.roomId },
      orderBy: { name: 'asc' },
    });
    res.json({ data: categories });
  } catch (error) {
    next(error);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const isAdmin = await roomService.isRoomAdmin(req.params.roomId, req.userId!);
    if (!isAdmin) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only admins can create categories' } });
      return;
    }
    const { default: prisma } = await import('../config/db');
    const category = await prisma.roomCategory.create({
      data: {
        roomId: req.params.roomId,
        name: req.body.name,
        isPreset: false,
      },
    });
    res.status(201).json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function getDefaultRules(req: Request, res: Response, next: NextFunction) {
  try {
    const { default: prisma } = await import('../config/db');
    const rules = await prisma.roomDefaultRule.findMany({
      where: { roomId: req.params.roomId },
    });
    res.json({ data: rules });
  } catch (error) {
    next(error);
  }
}

export async function updateDefaultRules(req: Request, res: Response, next: NextFunction) {
  try {
    const isAdmin = await roomService.isRoomAdmin(req.params.roomId, req.userId!);
    if (!isAdmin) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only admins can update default rules' } });
      return;
    }
    const { default: prisma } = await import('../config/db');
    const { rules } = req.body;
    
    // Upsert each rule
    for (const rule of rules) {
      await prisma.roomDefaultRule.upsert({
        where: { roomId_categoryName: { roomId: req.params.roomId, categoryName: rule.categoryName } },
        update: { defaultParticipantScope: rule.defaultParticipantScope },
        create: {
          roomId: req.params.roomId,
          categoryName: rule.categoryName,
          defaultParticipantScope: rule.defaultParticipantScope,
        },
      });
    }
    
    const updated = await prisma.roomDefaultRule.findMany({
      where: { roomId: req.params.roomId },
    });
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
}

export async function getAuditLog(req: Request, res: Response, next: NextFunction) {
  try {
    const { default: prisma } = await import('../config/db');
    const where: any = { roomId: req.params.roomId };
    if (req.query.entityType) where.entityType = req.query.entityType;
    if (req.query.entityId) where.entityId = req.query.entityId;

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({
      data: logs.map(l => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        userId: l.user.id,
        userName: l.user.name,
        reason: l.reason,
        oldData: l.oldData,
        newData: l.newData,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
}

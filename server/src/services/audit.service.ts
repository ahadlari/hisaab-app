import prisma from '../config/db';
import { logger } from '../utils/logger';
import type { AuditAction } from '../types';

/**
 * Write an immutable audit log entry.
 * Called inside DB transactions for all balance-affecting mutations.
 */
export async function createAuditLog(params: {
  roomId: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  reason?: string | null;
}, tx?: any) {
  const client = tx || prisma;
  
  const auditLog = await client.auditLog.create({
    data: {
      roomId: params.roomId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      oldData: params.oldData || undefined,
      newData: params.newData || undefined,
      reason: params.reason || undefined,
    },
  });

  logger.info({ action: params.action, entityType: params.entityType, entityId: params.entityId, roomId: params.roomId }, `Audit log written: ${params.action}`);

  return auditLog;
}

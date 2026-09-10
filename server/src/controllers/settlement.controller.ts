import { Request, Response, NextFunction } from 'express';
import * as settlementService from '../services/settlement.service';

export async function createSettlement(req: Request, res: Response, next: NextFunction) {
  try {
    const { settlement, warning } = await settlementService.createSettlement(
      req.params.roomId,
      req.userId!,
      req.body
    );

    // Serialize BigInt for JSON
    const serialized = {
      id: settlement.id,
      fromUserId: settlement.fromUserId,
      toUserId: settlement.toUserId,
      amountPaise: Number(settlement.amountPaise),
      status: settlement.status,
      paymentMethod: settlement.paymentMethod,
      proofUrl: settlement.proofUrl,
      note: settlement.note,
    };

    res.status(201).json({ data: serialized, warning });
  } catch (error) {
    next(error);
  }
}

export async function getSettlements(req: Request, res: Response, next: NextFunction) {
  try {
    const settlements = await settlementService.getSettlements(
      req.params.roomId,
      { status: req.query.status as string | undefined }
    );
    res.json({
      data: settlements.map(s => ({
        ...s,
        amountPaise: Number(s.amountPaise),
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function editSettlement(req: Request, res: Response, next: NextFunction) {
  try {
    const settlement = await settlementService.editSettlement(
      req.params.roomId,
      req.params.settlementId,
      req.userId!,
      req.body
    );
    res.json({ data: { ...settlement, amountPaise: Number(settlement.amountPaise) } });
  } catch (error) {
    next(error);
  }
}

export async function cancelSettlement(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await settlementService.cancelSettlement(
      req.params.roomId,
      req.params.settlementId,
      req.userId!,
      req.body.reason
    );
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function verifySettlement(req: Request, res: Response, next: NextFunction) {
  try {
    const settlement = await settlementService.verifySettlement(
      req.params.roomId,
      req.params.settlementId,
      req.userId!,
      req.body
    );
    res.json({ data: { ...settlement, amountPaise: Number(settlement.amountPaise) } });
  } catch (error) {
    next(error);
  }
}

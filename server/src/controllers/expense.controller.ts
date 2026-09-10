import { Request, Response, NextFunction } from 'express';
import * as expenseService from '../services/expense.service';

export async function createExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const expense = await expenseService.createExpense(
      req.params.roomId,
      req.userId!,
      req.body
    );
    res.status(201).json({ data: expense });
  } catch (error) {
    next(error);
  }
}

export async function getExpenses(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await expenseService.getExpenses(req.params.roomId, {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
      category: req.query.category as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getExpenseById(req: Request, res: Response, next: NextFunction) {
  try {
    const expense = await expenseService.getExpenseById(
      req.params.roomId,
      req.params.expenseId
    );
    res.json({ data: expense });
  } catch (error) {
    next(error);
  }
}

export async function editExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const expense = await expenseService.editExpense(
      req.params.roomId,
      req.params.expenseId,
      req.userId!,
      req.body
    );
    res.json({ data: expense });
  } catch (error) {
    next(error);
  }
}

export async function voidExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await expenseService.voidExpense(
      req.params.roomId,
      req.params.expenseId,
      req.userId!,
      { reason: req.body.reason, force: req.body.force }
    );
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
}

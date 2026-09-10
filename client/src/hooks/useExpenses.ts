import { useState, useEffect, useCallback } from 'react';
import { expenseApi } from '../api/expense.api';
import type { Expense } from '../types';

export function useExpenses(roomId: string | undefined, params?: { page?: number; status?: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await expenseApi.list(roomId, params);
      setExpenses(res.data);
      setTotal(res.meta.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load expenses');
    }
    setLoading(false);
  }, [roomId, params?.page, params?.status]);

  useEffect(() => { fetch(); }, [fetch]);

  return { expenses, total, loading, error, refetch: fetch };
}

import { useState, useEffect, useCallback } from 'react';
import { roomApi } from '../api/room.api';
import type { BalancesResponse } from '../types';

export function useRoomBalances(roomId: string | undefined) {
  const [data, setData] = useState<BalancesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await roomApi.getBalances(roomId);
      setData(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load balances');
    }
    setLoading(false);
  }, [roomId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

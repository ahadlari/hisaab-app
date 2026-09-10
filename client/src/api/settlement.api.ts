import { api } from './client';
import type { Settlement } from '../types';

export const settlementApi = {
  create: (roomId: string, data: { fromUserId: string; toUserId: string; amountPaise: number; paymentMethod?: string; proofUrl?: string; note?: string }) =>
    api.post<{ data: Settlement; warning?: string }>(`/rooms/${roomId}/settlements`, data),

  list: (roomId: string, status?: string) => {
    const qs = status ? `?status=${status}` : '';
    return api.get<{ data: Settlement[] }>(`/rooms/${roomId}/settlements${qs}`);
  },

  edit: (roomId: string, settlementId: string, data: { amountPaise?: number; paymentMethod?: string; note?: string; reason?: string }) =>
    api.patch<{ data: Settlement }>(`/rooms/${roomId}/settlements/${settlementId}`, data),

  cancel: (roomId: string, settlementId: string, reason?: string) =>
    api.post<{ data: { id: string; status: string } }>(
      `/rooms/${roomId}/settlements/${settlementId}/cancel`,
      { reason }
    ),

  verify: (roomId: string, settlementId: string, data: { status: 'CONFIRMED' | 'REJECTED'; reason?: string }) =>
    api.patch<{ data: Settlement }>(`/rooms/${roomId}/settlements/${settlementId}/verify`, data),
};

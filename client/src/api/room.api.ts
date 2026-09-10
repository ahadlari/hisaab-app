import { api } from './client';
import type { Room, RoomDetails, BalancesResponse, MonthlySummary, Category, AuditLogEntry } from '../types';

export const roomApi = {
  create: (name: string) =>
    api.post<{ data: Room }>('/rooms', { name }),

  join: (inviteCode: string) =>
    api.post<{ data: { roomId: string; role: string } }>('/rooms/join', { inviteCode }),

  list: () =>
    api.get<{ data: Room[] }>('/rooms'),

  getDetails: (roomId: string) =>
    api.get<{ data: RoomDetails }>(`/rooms/${roomId}`),

  update: (roomId: string, data: { name?: string; status?: string }) =>
    api.patch<{ data: Room }>(`/rooms/${roomId}`, data),

  getBalances: (roomId: string) =>
    api.get<{ data: BalancesResponse }>(`/rooms/${roomId}/balances`),

  getMonthlySummary: (roomId: string, month: string) =>
    api.get<{ data: MonthlySummary }>(`/rooms/${roomId}/summary?month=${month}`),

  getCategories: (roomId: string) =>
    api.get<{ data: Category[] }>(`/rooms/${roomId}/categories`),

  createCategory: (roomId: string, name: string) =>
    api.post<{ data: Category }>(`/rooms/${roomId}/categories`, { name }),

  getAuditLog: (roomId: string, params?: { entityType?: string; entityId?: string }) => {
    const query = new URLSearchParams();
    if (params?.entityType) query.set('entityType', params.entityType);
    if (params?.entityId) query.set('entityId', params.entityId);
    const qs = query.toString();
    return api.get<{ data: AuditLogEntry[] }>(`/rooms/${roomId}/audit-log${qs ? '?' + qs : ''}`);
  },

  removeMember: (roomId: string, userId: string, force?: boolean) =>
    api.post(`/rooms/${roomId}/members/${userId}/remove`, { force }),
};

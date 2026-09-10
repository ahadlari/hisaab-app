import { api } from './client';
import type { Expense } from '../types';

export const expenseApi = {
  create: (roomId: string, data: any) =>
    api.post<{ data: Expense }>(`/rooms/${roomId}/expenses`, data),

  list: (roomId: string, params?: { page?: number; pageSize?: number; category?: string; status?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.category) query.set('category', params.category);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    return api.get<{ data: Expense[]; meta: { total: number; page: number; pageSize: number } }>(
      `/rooms/${roomId}/expenses${qs ? '?' + qs : ''}`
    );
  },

  getById: (roomId: string, expenseId: string) =>
    api.get<{ data: Expense }>(`/rooms/${roomId}/expenses/${expenseId}`),

  edit: (roomId: string, expenseId: string, data: any) =>
    api.patch<{ data: Expense }>(`/rooms/${roomId}/expenses/${expenseId}`, data),

  void: (roomId: string, expenseId: string, reason?: string, force?: boolean) =>
    api.post<{ data: { id: string; status: string } }>(
      `/rooms/${roomId}/expenses/${expenseId}/void`,
      { reason, force }
    ),
};

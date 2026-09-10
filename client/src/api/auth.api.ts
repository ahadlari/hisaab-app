import { api } from './client';
import type { User } from '../types';

export const authApi = {
  register: (data: { name: string; email?: string; phone?: string; password: string }) =>
    api.post<{ data: { user: User; token: string } }>('/auth/register', data),

  login: (data: { email?: string; phone?: string; password: string }) =>
    api.post<{ data: { user: User; token: string } }>('/auth/login', data),

  getMe: () => api.get<{ data: { user: User } }>('/auth/me'),
  updateMe: (data: { upiId: string }) => api.patch<{ data: { user: User } }>('/auth/me', data),
};

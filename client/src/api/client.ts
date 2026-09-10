// ─────────────────────────────────────────────
// API Client — base fetch wrapper
// ─────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

function getToken(): string | null {
  return localStorage.getItem('hisaab_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    // Build a user-friendly message from Zod validation details if available
    let message = data.error?.message || 'Request failed';
    if (data.error?.details && Array.isArray(data.error.details)) {
      const fieldErrors = data.error.details
        .map((d: { path?: string; message?: string }) => {
          const field = d.path || '';
          const msg = d.message || '';
          return field ? `${field}: ${msg}` : msg;
        })
        .join('. ');
      if (fieldErrors) message = fieldErrors;
    }

    const error = new Error(message) as Error & { 
      code?: string; details?: any; status?: number 
    };
    error.code = data.error?.code;
    error.details = data.error?.details;
    error.status = res.status;
    throw error;
  }

  return data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: any) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: any) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: any) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

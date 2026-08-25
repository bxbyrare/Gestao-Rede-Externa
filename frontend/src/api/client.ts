export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(buildUrl(path, options.query), {
    method,
    headers,
    body,
    credentials: 'include',
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const message = (data && (data.error as string)) || `Erro ${res.status}`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}

// Some legacy endpoints (e.g. /api/technicians) read request.form rather than JSON —
// this sends a real multipart/form-data body for those instead of api.post's JSON.
async function requestForm<T>(path: string, method: string, fields: Record<string, string | undefined>): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, value);
  }
  const res = await fetch(buildUrl(path), { method, body: form, credentials: 'include' });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : undefined;
  if (!res.ok) {
    const message = (data && (data.error as string)) || `Erro ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

async function requestFormData<T>(path: string, method: string, formData: FormData): Promise<T> {
  const res = await fetch(buildUrl(path), { method, body: formData, credentials: 'include' });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : undefined;
  if (!res.ok) {
    const message = (data && (data.error as string)) || `Erro ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, fields: Record<string, string | undefined>) => requestForm<T>(path, 'POST', fields),
  putForm: <T>(path: string, fields: Record<string, string | undefined>) => requestForm<T>(path, 'PUT', fields),
  postFormData: <T>(path: string, formData: FormData) => requestFormData<T>(path, 'POST', formData),
  putFormData: <T>(path: string, formData: FormData) => requestFormData<T>(path, 'PUT', formData),
};

export function assetUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return path;
}

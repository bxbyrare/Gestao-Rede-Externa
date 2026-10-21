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

function handleUnauthorized(path: string, status: number): boolean {
  if (status === 401 && !path.startsWith('/api/auth/') && window.location.pathname !== '/login') {
    window.location.href = '/login';
    return true;
  }
  return false;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      credentials: 'include',
    });

    if (handleUnauthorized(path, res.status)) return new Promise(() => {});

    if (res.status === 204) return undefined as T;

    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json().catch(() => undefined) : undefined;

    if (!res.ok) {
      const message = (data && (data.error as string)) || `Falha na requisição (${res.status})`;
      throw new ApiError(res.status, message);
    }

    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'Falha de comunicação com o servidor. Verifique sua conexão com a rede.');
  }
}

async function requestForm<T>(path: string, method: string, fields: Record<string, string | undefined>): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, value);
  }
  try {
    const res = await fetch(buildUrl(path), { method, body: form, credentials: 'include' });
    if (handleUnauthorized(path, res.status)) return new Promise(() => {});
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json().catch(() => undefined) : undefined;
    if (!res.ok) {
      const message = (data && (data.error as string)) || `Falha na requisição (${res.status})`;
      throw new ApiError(res.status, message);
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'Falha de comunicação com o servidor. Verifique sua conexão com a rede.');
  }
}

async function requestFormData<T>(path: string, method: string, formData: FormData): Promise<T> {
  try {
    const res = await fetch(buildUrl(path), { method, body: formData, credentials: 'include' });
    if (handleUnauthorized(path, res.status)) return new Promise(() => {});
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json().catch(() => undefined) : undefined;
    if (!res.ok) {
      const message = (data && (data.error as string)) || `Falha na requisição (${res.status})`;
      throw new ApiError(res.status, message);
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'Falha de comunicação com o servidor. Verifique sua conexão com a rede.');
  }
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

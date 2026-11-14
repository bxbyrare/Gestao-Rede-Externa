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
  signal?: AbortSignal;
  timeoutMs?: number;
}

let redirectingToLogin = false;

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
  if (
    status === 401 &&
    !path.startsWith('/api/auth/') &&
    !path.startsWith('/api/public/') &&
    !path.includes('/submit') &&
    window.location.pathname !== '/login' &&
    !window.location.pathname.startsWith('/f/')
  ) {
    if (!redirectingToLogin) {
      redirectingToLogin = true;
      window.location.href = '/login';
    }
    return true;
  }
  return false;
}

async function executeFetch<T>(
  path: string,
  init: RequestInit,
  options: { query?: RequestOptions['query']; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30000;
  const timer = window.setTimeout(() => controller.abort(new DOMException('Request timeout', 'TimeoutError')), timeoutMs);

  const onExternalAbort = () => controller.abort(options.signal?.reason);
  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timer);
      throw new DOMException('Aborted', 'AbortError');
    }
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(buildUrl(path, options.query), {
      ...init,
      credentials: 'include',
      signal: controller.signal,
    });

    if (handleUnauthorized(path, res.status)) {
      throw new ApiError(401, 'Sessão expirada. Redirecionando para login...');
    }

    if (res.status === 204) return undefined as T;

    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json().catch(() => undefined) : undefined;

    if (!res.ok) {
      const message =
        (data && ((data.error as string) || (data.message as string))) ||
        `Falha na requisição (${res.status})`;
      throw new ApiError(res.status, message);
    }

    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ApiError(408, 'Tempo limite da requisição excedido. Tente novamente.');
    }
    throw new ApiError(0, 'Falha de comunicação com o servidor. Verifique sua conexão com a rede.');
  } finally {
    clearTimeout(timer);
    if (options.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  return executeFetch<T>(
    path,
    { method, headers, body },
    { query: options.query, signal: options.signal, timeoutMs: options.timeoutMs },
  );
}

async function requestForm<T>(path: string, method: string, fields: Record<string, string | undefined>): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, value);
  }
  return executeFetch<T>(path, { method, body: form }, { timeoutMs: 60000 });
}

async function requestFormData<T>(path: string, method: string, formData: FormData): Promise<T> {
  return executeFetch<T>(path, { method, body: formData }, { timeoutMs: 120000 });
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], opts?: Pick<RequestOptions, 'signal' | 'timeoutMs'>) =>
    request<T>(path, { method: 'GET', query, ...opts }),
  post: <T>(path: string, body?: unknown, opts?: Pick<RequestOptions, 'signal' | 'timeoutMs'>) =>
    request<T>(path, { method: 'POST', body, ...opts }),
  put: <T>(path: string, body?: unknown, opts?: Pick<RequestOptions, 'signal' | 'timeoutMs'>) =>
    request<T>(path, { method: 'PUT', body, ...opts }),
  patch: <T>(path: string, body?: unknown, opts?: Pick<RequestOptions, 'signal' | 'timeoutMs'>) =>
    request<T>(path, { method: 'PATCH', body, ...opts }),
  delete: <T>(path: string, opts?: Pick<RequestOptions, 'signal' | 'timeoutMs'>) =>
    request<T>(path, { method: 'DELETE', ...opts }),
  postForm: <T>(path: string, fields: Record<string, string | undefined>) => requestForm<T>(path, 'POST', fields),
  putForm: <T>(path: string, fields: Record<string, string | undefined>) => requestForm<T>(path, 'PUT', fields),
  postFormData: <T>(path: string, formData: FormData) => requestFormData<T>(path, 'POST', formData),
  putFormData: <T>(path: string, formData: FormData) => requestFormData<T>(path, 'PUT', formData),
};

export function assetUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return path;
}

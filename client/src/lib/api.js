const TOKEN_KEY = 'airwatch.token';

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (token) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable: session lasts until reload */ }
  },
};

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(method, path, { json, form, signal, raw } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body: json ? JSON.stringify(json) : form, signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Cannot reach the AirWatch server. Check your connection and try again.');
  }
  if (response.status === 401 && token && !path.startsWith('/auth/')) onUnauthorized();
  if (!response.ok) {
    let body = null;
    try { body = await response.json(); } catch { /* non-JSON error */ }
    throw new ApiError(response.status, body?.error?.message || `Request failed (${response.status})`, body?.error?.fields);
  }
  if (raw) return response;
  return response.status === 204 ? null : response.json();
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, json, opts) => request('POST', path, { json: json ?? {}, ...opts }),
  put: (path, json, opts) => request('PUT', path, { json, ...opts }),
  upload: (path, form) => request('POST', path, { form }),
  blob: async (path) => (await request('GET', path.replace(/^\/api/, ''), { raw: true })).blob(),
};

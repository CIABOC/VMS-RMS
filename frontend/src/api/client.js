// Thin fetch wrapper. All calls go to the same origin (/api), so the session cookie
// and the XSRF-TOKEN cookie set by Spring Security are sent automatically.

export class ApiError extends Error {
  constructor(status, message, fieldErrors) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors || {};
  }
}

function cookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

async function request(path, { method = 'GET', body, form, raw } = {}) {
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') {
    const token = cookie('XSRF-TOKEN');
    if (token) headers['X-XSRF-TOKEN'] = token;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers,
      credentials: 'same-origin',
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check the network connection.');
  }

  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event('rvm:unauthorized'));
  }
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    throw new ApiError(res.status, data?.message || defaultMessage(res.status), data?.fieldErrors);
  }
  if (raw) return res.blob();
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function defaultMessage(status) {
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return 'You do not have permission for this action.';
  if (status === 404) return 'Not found.';
  return 'Something went wrong. Please try again.';
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST', form: formData }),
  blob: (path) => request(path, { raw: true }),
};

/** Builds a query string, skipping empty values. */
export function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.append(k, v);
  });
  const s = p.toString();
  return s ? '?' + s : '';
}

import { CONFIG } from '../auth.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let _token = null;
let _onUnauthorized = null;

export function setAuthToken(token) {
  _token = token;
}

export function clearAuthToken() {
  _token = null;
}

export function setUnauthorizedHandler(fn) {
  _onUnauthorized = fn;
}

export async function api(method, path, body) {
  const url = CONFIG.apiEndpoint + path;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _token },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(url, opts);
  if (resp.status === 401) {
    if (_onUnauthorized) _onUnauthorized();
    throw new ApiError(401, 'セッションが切れました。再度ログインしてください');
  }
  if (!resp.ok) throw new ApiError(resp.status, `HTTP ${resp.status}`);
  return resp.json().catch(() => ({}));
}

import { CONFIG } from './auth.js';

let _token = null;

export function setAuthToken(token) {
  _token = token;
}

export function clearAuthToken() {
  _token = null;
}

export async function api(method, path, body) {
    const url = CONFIG.apiEndpoint + path;
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _token },
    };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    if (!resp.ok) return Promise.reject(new Error(`HTTP ${resp.status}`));
    return resp.json().catch(() => ({}));
  }

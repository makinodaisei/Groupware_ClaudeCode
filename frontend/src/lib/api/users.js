import { api } from './client.js';

export function getUsers(params = {}) {
  const qs = params.limit ? `?limit=${params.limit}` : '';
  return api('GET', `/users${qs}`);
}

export function getUser(userId) {
  return api('GET', `/users/${userId}`);
}

export function createUser(data) {
  return api('POST', '/users', data);
}

export function updateUser(userId, data) {
  return api('PUT', `/users/${userId}`, data);
}

export function deleteUser(userId) {
  return api('DELETE', `/users/${userId}`);
}

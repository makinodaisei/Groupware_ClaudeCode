import { api } from './client.js';

export function getOrgs() {
  return api('GET', '/orgs');
}

export function createOrg(data) {
  return api('POST', '/orgs', data);
}

export function updateOrg(orgId, data) {
  return api('PUT', `/orgs/${orgId}`, data);
}

export function deleteOrg(orgId) {
  return api('DELETE', `/orgs/${orgId}`);
}

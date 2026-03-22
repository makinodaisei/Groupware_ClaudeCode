import { api } from './client.js';

export function getFacilityTypes() {
  return api('GET', '/facility-types');
}

export function createFacilityType(data) {
  return api('POST', '/facility-types', data);
}

export function updateFacilityType(typeId, data) {
  return api('PUT', `/facility-types/${typeId}`, data);
}

export function deleteFacilityType(typeId) {
  return api('DELETE', `/facility-types/${typeId}`);
}

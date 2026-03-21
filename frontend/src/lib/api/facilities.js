import { api } from './client.js';

export function getFacilities() {
  return api('GET', '/facilities');
}

export function createFacility(data) {
  return api('POST', '/facilities', data);
}

export function updateFacility(facilityId, data) {
  return api('PUT', `/facilities/${facilityId}`, data);
}

export function deleteFacility(facilityId) {
  return api('DELETE', `/facilities/${facilityId}`);
}

export function getReservations(facilityId, date) {
  return api('GET', `/facilities/${facilityId}/reservations?date=${date}`);
}

export function createReservation(facilityId, data) {
  return api('POST', `/facilities/${facilityId}/reservations`, data);
}

export function deleteReservation(facilityId, reservationId) {
  return api('DELETE', `/facilities/${facilityId}/reservations/${reservationId}`);
}

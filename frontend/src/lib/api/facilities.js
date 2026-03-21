import { api } from './client.js';

export function getFacilities() {
  return api('GET', '/facilities');
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

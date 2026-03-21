import { api } from './client.js';

export function getSchedules({ month, start, end } = {}) {
  if (month) return api('GET', `/schedules?month=${month}`);
  if (start && end) return api('GET', `/schedules?start=${start}&end=${end}`);
  return Promise.reject(new Error("Provide 'month' or 'start'+'end'"));
}

export function createSchedule(data) {
  return api('POST', '/schedules', data);
}

export function updateSchedule(id, data) {
  return api('PUT', `/schedules/${id}`, data);
}

export function deleteSchedule(id) {
  return api('DELETE', `/schedules/${id}`);
}

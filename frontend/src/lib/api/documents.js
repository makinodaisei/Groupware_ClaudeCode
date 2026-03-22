import { api } from './client.js';

export function getFolders(parentFolderId) {
  const qs = parentFolderId ? `?parentFolderId=${parentFolderId}` : '';
  return api('GET', `/documents/folders${qs}`);
}

export function createFolder(data) {
  return api('POST', '/documents/folders', data);
}

export function deleteFolder(folderId) {
  return api('DELETE', `/documents/folders/${folderId}`);
}

export function getFiles(folderId) {
  return api('GET', `/documents/folders/${folderId}/files`);
}

export function getUploadUrl(folderId, data) {
  return api('POST', `/documents/folders/${folderId}/files/upload-url`, data);
}

export function getDownloadUrl(folderId, fileId) {
  return api('GET', `/documents/folders/${folderId}/files/${fileId}/download-url`);
}

export function deleteFile(folderId, fileId) {
  return api('DELETE', `/documents/folders/${folderId}/files/${fileId}`);
}

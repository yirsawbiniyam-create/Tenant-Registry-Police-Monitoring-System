export const FIREBASE_PROJECT_ID = 'tenant-registry-pol-mon-system';
export const DEV_APP_HOSTNAME =
  'ais-dev-vndts6xlpawdmdiyhwxxtq-181591441189.europe-west2.run.app';
export const SHARED_APP_HOSTNAME =
  'ais-pre-vndts6xlpawdmdiyhwxxtq-181591441189.europe-west2.run.app';

export function getCurrentHostname(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname || '';
}

export function getHostnamesToAuthorize(): string[] {
  const current = getCurrentHostname();
  const list = [current, SHARED_APP_HOSTNAME, DEV_APP_HOSTNAME].filter(Boolean);
  return Array.from(new Set(list));
}

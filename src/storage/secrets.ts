import { canStoreLongLivedSecrets, credentialBackends } from './backends';

// Passwords and API token secrets for logins marked "remember". Native only:
// on web every call is a no-op, so nothing long-lived ever reaches the browser.

const secretKey = (loginId: string) => `pc.secret.${loginId}`;

export async function saveLoginSecret(loginId: string, secret: string): Promise<void> {
  if (!canStoreLongLivedSecrets) return;
  await credentialBackends.device.setItem(secretKey(loginId), secret);
}

export async function loadLoginSecret(loginId: string): Promise<string | null> {
  if (!canStoreLongLivedSecrets) return null;
  return credentialBackends.device.getItem(secretKey(loginId));
}

export async function deleteLoginSecret(loginId: string): Promise<void> {
  if (!canStoreLongLivedSecrets) return;
  await credentialBackends.device.removeItem(secretKey(loginId));
}

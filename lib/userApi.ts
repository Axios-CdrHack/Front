import type { UserAccount, WalletLinkProof } from "./types";
import { getStoredAppAuthToken } from "./appAuth";
import { API_BASE_URL } from "./apiConfig";

async function userApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const appAuthToken = getStoredAppAuthToken();
  if (appAuthToken && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${appAuthToken}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function createEmailUser(input: { email: string }) {
  return userApiRequest<{ user: UserAccount }>("/users/email-session", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function connectWalletToEmailUser(input: { email: string; walletAddress: string }) {
  return userApiRequest<{ user: UserAccount; walletLinkProof: WalletLinkProof }>("/users/wallet", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

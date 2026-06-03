import { API_BASE_URL } from "./apiConfig";
import type { UserAccount } from "./types";

const APP_AUTH_SESSION_KEY = "axios:app-auth-session";
const EXPIRY_SKEW_MS = 30_000;
let exchangeInFlight: { privyAccessToken: string; promise: Promise<AppAuthSession> } | undefined;

export type AppAuthSession = {
  token: string;
  expiresAt: string;
  privyUserId: string;
  sessionId: string;
  email?: string;
  walletAddress?: string;
  smartWalletAddress?: string;
};

export type PrivyExchangeResponse = {
  session: AppAuthSession;
  user?: UserAccount;
};

function readStoredSession(): AppAuthSession | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.sessionStorage.getItem(APP_AUTH_SESSION_KEY);
  if (!raw) return undefined;
  try {
    const session = JSON.parse(raw) as AppAuthSession;
    if (!session.token || Date.parse(session.expiresAt) <= Date.now() + EXPIRY_SKEW_MS) {
      clearAppAuthSession();
      return undefined;
    }
    return session;
  } catch {
    clearAppAuthSession();
    return undefined;
  }
}

function readJwtPayload(token: string): Record<string, unknown> | undefined {
  try {
    const [, payload] = token.split(".");
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function getStoredAppAuthToken() {
  return readStoredSession()?.token;
}

export function clearAppAuthSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(APP_AUTH_SESSION_KEY);
  exchangeInFlight = undefined;
}

export async function exchangePrivyJwtForAppSession(getPrivyAccessToken: () => Promise<string | null>): Promise<AppAuthSession> {
  const privyAccessToken = await getPrivyAccessToken();
  if (!privyAccessToken) throw new Error("privy_access_token_missing");

  const stored = readStoredSession();
  const privyPayload = typeof window !== "undefined" ? readJwtPayload(privyAccessToken) : undefined;
  if (stored && stored.privyUserId === privyPayload?.sub) {
    return stored;
  }

  if (exchangeInFlight?.privyAccessToken === privyAccessToken) {
    return exchangeInFlight.promise;
  }

  const promise = fetch(`${API_BASE_URL}/auth/privy/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ privyAccessToken }),
  })
    .then(async (response) => {
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed with ${response.status}`);
      }

      const body = (await response.json()) as PrivyExchangeResponse;
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(APP_AUTH_SESSION_KEY, JSON.stringify(body.session));
      }
      return body.session;
    })
    .finally(() => {
      if (exchangeInFlight?.privyAccessToken === privyAccessToken) {
        exchangeInFlight = undefined;
      }
    });

  exchangeInFlight = { privyAccessToken, promise };
  return promise;
}

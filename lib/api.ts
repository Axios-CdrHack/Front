import type {
  CdrState,
  DataField,
  DataFieldKind,
  ExportPlan,
  FieldIpMetadata,
  LicenseTokenGrant,
  OrderResponse,
  OrderSummary,
  Profile,
  PublicCardProfile,
  PublicProfileFields,
  QuoteResponse,
  SaleSummary,
  SearchRequestDetail,
  SearchRequestSummary,
} from "./types";
import { getStoredAppAuthToken } from "./appAuth";
import { API_BASE_URL } from "./apiConfig";

export { API_BASE_URL } from "./apiConfig";

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
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

export function getQuote(input: { prompt: string; wantedFields?: DataFieldKind[]; buyerWallet?: string }) {
  return apiRequest<QuoteResponse>("/search/quote", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listSearchRequests(wallet: string) {
  return apiRequest<{ requests: SearchRequestSummary[] }>(`/search/requests?wallet=${encodeURIComponent(wallet)}`);
}

export function getSearchRequest(requestId: string) {
  return apiRequest<{ request: SearchRequestDetail }>(`/search/requests/${encodeURIComponent(requestId)}`);
}

export function extendSearchRequest(requestId: string, input: { prompt: string }) {
  return apiRequest<{ request: SearchRequestDetail }>(`/search/requests/${encodeURIComponent(requestId)}/extend`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createOrder(input: {
  quoteId?: string;
  buyerWallet: string;
  prompt: string;
  wantedFields: DataFieldKind[];
  selectedMatchRefs?: string[];
  selectedFieldIds?: string[];
  licenseTokenGrants?: LicenseTokenGrant[];
  paymentTxHash?: string;
}) {
  return apiRequest<OrderResponse>("/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listOrders(buyerWallet: string) {
  return apiRequest<{ orders: OrderSummary[] }>(`/orders?buyerWallet=${encodeURIComponent(buyerWallet)}`);
}

export function listSales(wallet: string) {
  return apiRequest<{
    sales: SaleSummary[];
    onchain?: { rpcUrl: string; contract: string; logCount: number };
  }>(`/sales?wallet=${encodeURIComponent(wallet)}`);
}

export function getExportPlan(orderId: string) {
  return apiRequest<ExportPlan>(`/orders/${orderId}/export-plan`);
}

export function upsertProfile(input: {
  id?: string;
  publicSlug?: string;
  displayName: string;
  avatarUrl?: string;
  walletAddress?: string;
  smartWalletAddress?: string;
  payoutAddress?: string;
  publicFields: PublicProfileFields;
}) {
  return apiRequest<{ profile: Profile }>("/profiles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getProfileFields(profileId: string) {
  return apiRequest<{ profile: Profile; fields: DataField[] }>(`/profiles/${profileId}/fields`);
}

export function getMyProfile() {
  return apiRequest<{ profile: Profile | null; fields: DataField[] }>("/profiles/me");
}

export function uploadAvatarImage(input: {
  ownerWallet: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
}) {
  return apiRequest<{ key: string; url: string }>("/uploads/avatar", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createFieldIpMetadata(input: {
  profileId: string;
  kind: DataFieldKind;
  label: string;
}) {
  return apiRequest<{ metadata: FieldIpMetadata }>("/uploads/field-ip-metadata", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function upsertField(input: {
  id?: string;
  profileId: string;
  kind: DataFieldKind;
  label: string;
  valuePreview: string;
  accessMode: "free" | "paid";
  priceCents: number;
  currency: "IP";
  requiresVerification?: boolean;
  verificationStatus?: "not_required" | "pending" | "verified";
  cdrState: CdrState;
  cdrVaultUuid?: string;
  deployTxHash?: string;
  cdrLicenseIpId?: string;
  cdrLicenseTermsId?: string;
  platformWallet?: string;
  ipaRecipient?: string;
  ipaNftContract?: string;
  ipaTokenId?: string;
  ipRegistrationTxHash?: string;
  ipaTransferTxHash?: string;
  sellerAddress?: string;
  licenseConfigTxHash?: string;
  licenseAttachTxHash?: string;
  cdrAllocateTxHash?: string;
}) {
  return apiRequest<{ field: DataField }>("/fields", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function startVerification(input: {
  profileId: string;
  fieldId?: string;
  channel: "email" | "mobile";
  target: string;
}) {
  return apiRequest<{ verificationId: string; expiresAt: string }>("/verify/start", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function confirmVerification(input: { verificationId: string; fieldId: string; code: string }) {
  return apiRequest<{ field: DataField }>("/verify/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function saveCdrDeployLog(input: { fieldId: string; cdrVaultUuid: string; deployTxHash: string }) {
  return apiRequest<{ field: DataField }>("/cdr/deploy-log", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deployCdrWithServerWallet(input: { fieldId: string }) {
  return apiRequest<{ field: DataField; deployment: Record<string, unknown> }>("/cdr/server-deploy", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type CdrServerDeployEvent =
  | { type: "status"; status: string; message?: string }
  | { type: "complete"; status: "complete"; field: DataField; deployment: Record<string, unknown> }
  | { type: "error"; error: string; message?: string; issues?: unknown[] };

function parseSseBlock(block: string): CdrServerDeployEvent | null {
  let eventName = "status";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) eventName = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trimStart());
  }
  if (!dataLines.length) return null;

  const payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
  if (eventName === "complete") return { type: "complete", ...payload } as CdrServerDeployEvent;
  if (eventName === "error") return { type: "error", ...payload } as CdrServerDeployEvent;
  return { type: "status", ...payload } as CdrServerDeployEvent;
}

export async function deployCdrWithServerWalletEvents(input: {
  fieldId: string;
  onEvent?(event: CdrServerDeployEvent): void;
}) {
  const headers = new Headers({ Accept: "text/event-stream" });
  const appAuthToken = getStoredAppAuthToken();
  if (appAuthToken) headers.set("Authorization", `Bearer ${appAuthToken}`);

  const response = await fetch(`${API_BASE_URL}/cdr/server-deploy/events?fieldId=${encodeURIComponent(input.fieldId)}`, {
    headers,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  if (!response.body) throw new Error("server_cdr_deploy_stream_unavailable");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (!event) continue;
      input.onEvent?.(event);
      if (event.type === "error") throw new Error(event.message || event.error);
      if (event.type === "complete") {
        await reader.cancel();
        return { field: event.field, deployment: event.deployment };
      }
    }
  }

  const trailing = buffer.trim() ? parseSseBlock(buffer) : null;
  if (trailing) {
    input.onEvent?.(trailing);
    if (trailing.type === "error") throw new Error(trailing.message || trailing.error);
    if (trailing.type === "complete") return { field: trailing.field, deployment: trailing.deployment };
  }
  throw new Error("server_cdr_deploy_stream_closed");
}

export function toggleCdr(input: { fieldId: string; cdrState: CdrState }) {
  return apiRequest<{ field: DataField }>("/cdr/toggle", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getPublicCard(slug: string) {
  return apiRequest<{ profile: PublicCardProfile }>(`/c/${encodeURIComponent(slug)}`);
}

export function saveExportLog(orderId: string, input: {
  generatedAt: string;
  successfulFieldIds: string[];
  failedFieldIds: string[];
  format: "csv" | "xlsx";
}) {
  return apiRequest<{ orderId: string; status: string }>(`/orders/${orderId}/export-log`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

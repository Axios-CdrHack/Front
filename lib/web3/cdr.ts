"use client";

import {
  CDR_LICENSE_READ_CONDITION_ADDRESS,
  CDR_OWNER_WRITE_CONDITION_ADDRESS,
  STORY_AENEID_CHAIN,
  STORY_AENEID_LICENSE_TOKEN_ADDRESS,
  STORY_AENEID_RPC_URL,
} from "./network";
import { API_BASE_URL } from "../api";
import type { ExportPlan } from "../types";
import type { PrivyWalletConnection } from "./privy";

export type CdrDeployStage =
  | "connect_wallet"
  | "allocate"
  | "encrypt"
  | "write"
  | "complete";

export type CdrDeployStageUpdate = {
  key: CdrDeployStage;
  message: string;
};

export type DeployInlineCdrVaultOptions = {
  onStageChange?(stage: CdrDeployStageUpdate): void;
};

let wasmReady: Promise<void> | null = null;

async function ensureWasm(initWasm: () => Promise<void>) {
  wasmReady ??= initWasm();
  await wasmReady;
}

function emitStage(options: DeployInlineCdrVaultOptions | undefined, key: CdrDeployStage, message: string) {
  options?.onStageChange?.({ key, message });
}

function buildVaultPayload(input: { label: string; value: string }) {
  return new TextEncoder().encode(JSON.stringify({ label: input.label, value: input.value }));
}

function decodeVaultPayload(dataKey: Uint8Array) {
  const payload = JSON.parse(new TextDecoder().decode(dataKey)) as { value?: unknown };
  if (typeof payload.value !== "string") throw new Error("invalid_cdr_payload");
  return payload.value;
}

function serializeCdrError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    };
  }
  return error;
}

function formatCdrLogPayload(payload: unknown) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function cdrLog(stage: string, payload: unknown) {
  console.debug("[axios-cdr]", stage, formatCdrLogPayload(payload));
}

function cdrLogError(stage: string, payload: unknown) {
  console.error("[axios-cdr]", stage, formatCdrLogPayload(payload));
}

function normalizeCdrUuid(uuid: string | number) {
  const parsed = Number(uuid);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("invalid_cdr_vault_uuid");
  return parsed;
}

export async function deployInlineCdrVaultBatch(
  wallet: PrivyWalletConnection,
  input: { label: string; value: string; licenseIpId: `0x${string}` },
  options?: DeployInlineCdrVaultOptions,
) {
  if (typeof window === "undefined") throw new Error("browser_required");

  const apiUrl = `${API_BASE_URL.replace(/\/+$/, "")}/cdr-api`;
  const { account, walletClient } = wallet;
  if (!account) throw new Error("wallet_account_not_found");
  emitStage(options, "connect_wallet", "Preparing wallet");

  const [{ Observer }, { Uploader }, { conditions }, { uuidToLabel }, { initWasm }, viem] = await Promise.all([
    import("@piplabs/cdr-sdk/dist/observer.js"),
    import("@piplabs/cdr-sdk/dist/uploader.js"),
    import("@piplabs/cdr-sdk/dist/conditions.js"),
    import("@piplabs/cdr-sdk/dist/label.js"),
    import("@piplabs/cdr-crypto"),
    import("viem"),
  ]);
  await ensureWasm(initWasm);

  const publicClient = viem.createPublicClient({
    chain: STORY_AENEID_CHAIN,
    transport: viem.http(STORY_AENEID_RPC_URL),
  });
  const observer = new Observer({
    network: "testnet",
    publicClient,
    apiUrl,
  });
  const uploader = new Uploader({
    network: "testnet",
    publicClient,
    walletClient,
    observer,
  });

  const writeCondition = conditions.ownerOnly({
    address: CDR_OWNER_WRITE_CONDITION_ADDRESS,
    owner: account,
  });
  const readCondition = conditions.custom({
    address: CDR_LICENSE_READ_CONDITION_ADDRESS,
    conditionData: viem.encodeAbiParameters(
      [{ type: "address" }, { type: "address" }],
      [STORY_AENEID_LICENSE_TOKEN_ADDRESS, input.licenseIpId],
    ),
  });

  // CDR deployment uses two on-chain steps: allocate first, then write.
  emitStage(options, "allocate", "Step 1/2: allocate vault");
  const { uuid, txHash: allocateTxHash } = await uploader.allocate({
    updatable: false,
    writeConditionAddr: writeCondition.address,
    readConditionAddr: readCondition.address,
    writeConditionData: writeCondition.conditionData,
    readConditionData: readCondition.conditionData,
  });

  emitStage(options, "encrypt", "Encrypting vault payload");
  const ciphertext = await uploader.encryptDataKey({
    dataKey: buildVaultPayload(input),
    label: uuidToLabel(uuid),
  });

  emitStage(options, "write", "Step 2/2: write encrypted vault");
  const { txHash: writeTxHash } = await uploader.write({
    uuid,
    accessAuxData: "0x",
    encryptedData: viem.toHex(ciphertext.raw),
  });

  emitStage(options, "complete", "CDR on");
  return {
    cdrVaultUuid: String(uuid),
    deployTxHash: writeTxHash,
    allocateTxHash,
  };
}

export const deployInlineCdrVault = deployInlineCdrVaultBatch;

export async function readInlineCdrVault(wallet: PrivyWalletConnection, item: ExportPlan["items"][number]) {
  if (typeof window === "undefined") throw new Error("browser_required");
  if (!item.cdrVaultUuid) throw new Error("cdr_vault_uuid_missing");
  if (!item.licenseTokenIds?.length) throw new Error("cdr_license_token_ids_missing");
  if (!item.accessAuxData || item.accessAuxData === "0x") throw new Error("cdr_access_aux_data_missing");

  const apiUrl = `${API_BASE_URL.replace(/\/+$/, "")}/cdr-api`;
  const uuid = normalizeCdrUuid(item.cdrVaultUuid);
  const { walletClient } = wallet;
  cdrLog("read_inline_start", {
    account: wallet.account,
    fieldId: item.fieldId,
    kind: item.kind,
    cdrVaultUuid: item.cdrVaultUuid,
    uuid,
    licenseTokenIds: item.licenseTokenIds,
    accessAuxData: item.accessAuxData,
    apiUrl,
  });
  const [{ Observer }, { Consumer }, { initWasm }, viem] = await Promise.all([
    import("@piplabs/cdr-sdk/dist/observer.js"),
    import("@piplabs/cdr-sdk/dist/consumer.js"),
    import("@piplabs/cdr-crypto"),
    import("viem"),
  ]);
  await ensureWasm(initWasm);

  const publicClient = viem.createPublicClient({
    chain: STORY_AENEID_CHAIN,
    transport: viem.http(STORY_AENEID_RPC_URL),
  });
  const observer = new Observer({
    network: "testnet",
    publicClient,
    apiUrl,
  });
  const consumer = new Consumer({
    network: "testnet",
    publicClient,
    walletClient,
    observer,
    apiUrl,
  });

  let dataKey: Uint8Array;
  try {
    const result = await consumer.accessCDR({
      uuid,
      accessAuxData: item.accessAuxData as `0x${string}`,
      timeoutMs: 120_000,
    });
    dataKey = result.dataKey;
    cdrLog("read_inline_success", {
      account: wallet.account,
      fieldId: item.fieldId,
      kind: item.kind,
      cdrVaultUuid: item.cdrVaultUuid,
      uuid,
      txHash: result.txHash,
      dataKeyBytes: dataKey.length,
    });
  } catch (error) {
    cdrLogError("read_inline_error", {
      account: wallet.account,
      fieldId: item.fieldId,
      kind: item.kind,
      cdrVaultUuid: item.cdrVaultUuid,
      uuid,
      licenseTokenIds: item.licenseTokenIds,
      accessAuxData: item.accessAuxData,
      error: serializeCdrError(error),
    });
    throw error;
  }

  return decodeVaultPayload(dataKey);
}

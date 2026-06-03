"use client";

import {
  STORY_AENEID_CHAIN,
  STORY_AENEID_LICENSE_TOKEN_ADDRESS,
  STORY_AENEID_LICENSING_MODULE_ADDRESS,
  STORY_AENEID_MULTICALL3_ADDRESS,
  STORY_AENEID_PILICENSE_TEMPLATE_ADDRESS,
  STORY_AENEID_RPC_URL,
  STORY_AENEID_WIP_TOKEN_ADDRESS,
} from "./network";
import type { PrivyWalletConnection } from "./privy";

const licensingModuleAbi = [
  {
    type: "function",
    name: "mintLicenseTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "licensorIpId", type: "address" },
      { name: "licenseTemplate", type: "address" },
      { name: "licenseTermsId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "royaltyContext", type: "bytes" },
      { name: "maxMintingFee", type: "uint256" },
      { name: "maxRevenueShare", type: "uint32" },
    ],
    outputs: [{ name: "startLicenseTokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "predictMintingLicenseFee",
    stateMutability: "view",
    inputs: [
      { name: "licensorIpId", type: "address" },
      { name: "licenseTemplate", type: "address" },
      { name: "licenseTermsId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "royaltyContext", type: "bytes" },
    ],
    outputs: [
      { name: "currencyToken", type: "address" },
      { name: "tokenAmount", type: "uint256" },
    ],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "allowance", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "ok", type: "bool" }],
  },
  {
    type: "function",
    name: "transferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "ok", type: "bool" }],
  },
] as const;

const wipTokenAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

const licenseTokenAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;

const multicall3Abi = [
  {
    type: "function",
    name: "aggregate3",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

const MAX_REVENUE_SHARE = 100_000_000;
const APPROVAL_RETRY_DELAY_MS = 4_000;
const APPROVAL_RETRY_ATTEMPTS = 15;
const MINT_DEBUG_EVENT_LIMIT = 80;

export type MintStoryLicenseTokenInput = {
  fieldId: string;
  licensorIpId: `0x${string}`;
  licenseTermsId: string;
  receiver: `0x${string}`;
};

function buildStoryPublicClient(viem: typeof import("viem")) {
  return viem.createPublicClient({
    chain: STORY_AENEID_CHAIN,
    transport: viem.http(STORY_AENEID_RPC_URL),
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toMintDebugValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[max_depth]";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause ? toMintDebugValue(value.cause, depth + 1) : undefined,
    };
  }
  if (Array.isArray(value)) return value.map((item) => toMintDebugValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toMintDebugValue(item, depth + 1)]));
  }
  return value;
}

function pushMintDebugEvent(kind: "debug" | "error", stage: string, payload?: unknown) {
  const event = {
    kind,
    stage,
    at: new Date().toISOString(),
    payload: toMintDebugValue(payload),
  };
  const globalValue = globalThis as unknown as { __AXIOS_MINT_DEBUG__?: unknown[] };
  globalValue.__AXIOS_MINT_DEBUG__ = [...(globalValue.__AXIOS_MINT_DEBUG__ ?? []), event].slice(-MINT_DEBUG_EVENT_LIMIT);
  return event;
}

function mintDebug(stage: string, payload?: unknown) {
  const event = pushMintDebugEvent("debug", stage, payload);
  console.debug("[axios-mint]", stage, event.payload);
}

function mintError(stage: string, error: unknown, payload?: unknown) {
  const event = pushMintDebugEvent("error", stage, { ...((payload && typeof payload === "object") ? payload : { payload }), error });
  console.error("[axios-mint]", stage, event.payload);
}

function errorText(error: unknown) {
  if (error instanceof Error) return [error.message, error.cause ? String(error.cause) : "", error.stack ?? ""].join("\n");
  return String(error);
}

function isReplacementUnderpricedError(error: unknown) {
  return /replacement transaction underpriced|transaction underpriced|nonce too low/i.test(errorText(error));
}

async function readErc20Allowance(
  publicClient: ReturnType<typeof buildStoryPublicClient>,
  currencyToken: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
) {
  return await publicClient.readContract({
    address: currencyToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  } as never) as bigint;
}

async function readErc20Balance(
  publicClient: ReturnType<typeof buildStoryPublicClient>,
  currencyToken: `0x${string}`,
  owner: `0x${string}`,
) {
  return await publicClient.readContract({
    address: currencyToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  } as never) as bigint;
}

async function waitForAllowanceOrNonceSettle(
  publicClient: ReturnType<typeof buildStoryPublicClient>,
  currencyToken: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
  tokenAmount: bigint,
) {
  for (let attempt = 0; attempt < APPROVAL_RETRY_ATTEMPTS; attempt += 1) {
    const allowance = await readErc20Allowance(publicClient, currencyToken, owner, spender);
    if (allowance >= tokenAmount) return true;

    try {
      const [latestNonce, pendingNonce] = await Promise.all([
        publicClient.getTransactionCount({ address: owner, blockTag: "latest" }),
        publicClient.getTransactionCount({ address: owner, blockTag: "pending" }),
      ]);
      if (pendingNonce <= latestNonce && attempt > 0) return false;
    } catch {
      // Some RPCs do not expose pending counts consistently; allowance polling still works.
    }

    await sleep(APPROVAL_RETRY_DELAY_MS);
  }
  return (await readErc20Allowance(publicClient, currencyToken, owner, spender)) >= tokenAmount;
}

async function ensureErc20Allowance(
  wallet: PrivyWalletConnection,
  publicClient: ReturnType<typeof buildStoryPublicClient>,
  currencyToken: `0x${string}`,
  spender: `0x${string}`,
  tokenAmount: bigint,
) {
  const currentAllowance = await readErc20Allowance(publicClient, currencyToken, wallet.account, spender);
  mintDebug("allowance_check", { currencyToken, spender, tokenAmount, currentAllowance });
  if (currentAllowance >= tokenAmount) return;

  try {
    mintDebug("approve_submit", { currencyToken, spender, tokenAmount });
    const approveTxHash = await wallet.walletClient.writeContract({
      account: wallet.account,
      chain: STORY_AENEID_CHAIN,
      address: currencyToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, tokenAmount],
    } as never);
    mintDebug("approve_submitted", { currencyToken, spender, tokenAmount, approveTxHash });
    const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTxHash as `0x${string}` });
    mintDebug("approve_receipt", { currencyToken, spender, tokenAmount, approveTxHash, status: approveReceipt.status });
    if (approveReceipt.status !== "success") throw new Error("license_fee_approval_failed");
    return;
  } catch (error) {
    mintError("approve_error", error, { currencyToken, spender, tokenAmount });
    if (!isReplacementUnderpricedError(error)) throw error;
  }

  mintDebug("approve_underpriced_wait_start", { currencyToken, spender, tokenAmount });
  if (await waitForAllowanceOrNonceSettle(publicClient, currencyToken, wallet.account, spender, tokenAmount)) {
    mintDebug("approve_underpriced_wait_success", { currencyToken, spender, tokenAmount });
    return;
  }
  const settledAllowance = await readErc20Allowance(publicClient, currencyToken, wallet.account, spender);
  mintDebug("approve_underpriced_wait_done", { currencyToken, spender, tokenAmount, settledAllowance });
  if (settledAllowance >= tokenAmount) return;

  mintDebug("approve_retry_submit", { currencyToken, spender, tokenAmount });
  const retryTxHash = await wallet.walletClient.writeContract({
    account: wallet.account,
    chain: STORY_AENEID_CHAIN,
    address: currencyToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, tokenAmount],
  } as never);
  mintDebug("approve_retry_submitted", { currencyToken, spender, tokenAmount, retryTxHash });
  const retryReceipt = await publicClient.waitForTransactionReceipt({ hash: retryTxHash as `0x${string}` });
  mintDebug("approve_retry_receipt", { currencyToken, spender, tokenAmount, retryTxHash, status: retryReceipt.status });
  if (retryReceipt.status !== "success") throw new Error("license_fee_approval_failed");
}

async function ensureMintFeePrepared(
  wallet: PrivyWalletConnection,
  publicClient: ReturnType<typeof buildStoryPublicClient>,
  currencyToken: `0x${string}`,
  tokenAmount: bigint,
) {
  const normalizedCurrency = currencyToken.toLowerCase();
  const normalizedWip = STORY_AENEID_WIP_TOKEN_ADDRESS.toLowerCase();
  const spender = STORY_AENEID_LICENSING_MODULE_ADDRESS;

  mintDebug("fee_prepare_start", {
    currencyToken,
    tokenAmount,
    spender,
    wallet: wallet.account,
    wrapsNativeIp: normalizedCurrency === normalizedWip,
  });

  let balance = await readErc20Balance(publicClient, currencyToken, wallet.account);
  mintDebug("fee_balance_check", { currencyToken, tokenAmount, balance });

  if (balance < tokenAmount) {
    if (normalizedCurrency !== normalizedWip) {
      mintError("fee_balance_insufficient", new Error("license_fee_balance_insufficient"), {
        currencyToken,
        tokenAmount,
        balance,
      });
      throw new Error("license_fee_balance_insufficient");
    }

    const shortfall = tokenAmount - balance;
    const nativeBalance = await publicClient.getBalance({ address: wallet.account });
    mintDebug("wip_wrap_required", { currencyToken, tokenAmount, balance, shortfall, nativeBalance });
    if (nativeBalance < shortfall) {
      mintError("wip_wrap_balance_insufficient", new Error("license_native_ip_balance_insufficient"), {
        currencyToken,
        tokenAmount,
        balance,
        shortfall,
        nativeBalance,
      });
      throw new Error("license_native_ip_balance_insufficient");
    }

    let wrapTxHash: `0x${string}`;
    try {
      mintDebug("wip_wrap_submit", { currencyToken, shortfall });
      wrapTxHash = await wallet.walletClient.writeContract({
        account: wallet.account,
        chain: STORY_AENEID_CHAIN,
        address: STORY_AENEID_WIP_TOKEN_ADDRESS,
        abi: wipTokenAbi,
        functionName: "deposit",
        args: [],
        value: shortfall,
      } as never) as `0x${string}`;
    } catch (error) {
      mintError("wip_wrap_submit_failed", error, { currencyToken, shortfall });
      throw error;
    }

    mintDebug("wip_wrap_submitted", { currencyToken, shortfall, wrapTxHash });
    const wrapReceipt = await publicClient.waitForTransactionReceipt({ hash: wrapTxHash });
    mintDebug("wip_wrap_receipt", {
      currencyToken,
      shortfall,
      wrapTxHash,
      status: wrapReceipt.status,
      gasUsed: wrapReceipt.gasUsed,
    });
    if (wrapReceipt.status !== "success") throw new Error("license_wip_wrap_failed");

    balance = await readErc20Balance(publicClient, currencyToken, wallet.account);
    mintDebug("fee_balance_after_wrap", { currencyToken, tokenAmount, balance });
    if (balance < tokenAmount) throw new Error("license_fee_balance_insufficient");
  }

  await ensureErc20Allowance(wallet, publicClient, currencyToken, spender, tokenAmount);
  const allowance = await readErc20Allowance(publicClient, currencyToken, wallet.account, spender);
  mintDebug("fee_prepare_done", { currencyToken, tokenAmount, balance, spender, allowance });
}

export async function mintStoryLicenseTokensBatch(wallet: PrivyWalletConnection, inputs: MintStoryLicenseTokenInput[]) {
  if (!inputs.length) throw new Error("license_batch_empty");

  const viem = await import("viem");
  const publicClient = buildStoryPublicClient(viem);
  const amount = 1n;
  const royaltyContext = "0x";
  const feesByCurrency = new Map<`0x${string}`, bigint>();
  const predictedFees: Array<{ currencyToken: `0x${string}`; tokenAmount: bigint }> = [];
  mintDebug("batch_start", {
    account: wallet.account,
    inputCount: inputs.length,
    fields: inputs.map((input) => ({
      fieldId: input.fieldId,
      licensorIpId: input.licensorIpId,
      licenseTermsId: input.licenseTermsId,
      receiver: input.receiver,
    })),
  });

  for (const [index, input] of inputs.entries()) {
    const licenseTermsId = BigInt(input.licenseTermsId);
    let currencyToken: `0x${string}`;
    let tokenAmount: bigint;
    try {
      [currencyToken, tokenAmount] = await publicClient.readContract({
        address: STORY_AENEID_LICENSING_MODULE_ADDRESS,
        abi: licensingModuleAbi,
        functionName: "predictMintingLicenseFee",
        args: [
          input.licensorIpId,
          STORY_AENEID_PILICENSE_TEMPLATE_ADDRESS,
          licenseTermsId,
          amount,
          input.receiver,
          royaltyContext,
        ],
      } as never) as readonly [`0x${string}`, bigint];
    } catch (error) {
      mintError("predict_fee_failed", error, { index, input });
      throw error;
    }
    mintDebug("predict_fee", { index, fieldId: input.fieldId, currencyToken, tokenAmount });
    predictedFees.push({ currencyToken, tokenAmount });
    if (tokenAmount > 0n) {
      if (currencyToken.toLowerCase() === viem.zeroAddress) throw new Error("license_fee_currency_missing");
      feesByCurrency.set(currencyToken, (feesByCurrency.get(currencyToken) ?? 0n) + tokenAmount);
    }
  }
  mintDebug("fee_summary", {
    feesByCurrency: Array.from(feesByCurrency.entries()).map(([currencyToken, tokenAmount]) => ({ currencyToken, tokenAmount })),
  });

  for (const [currencyToken, tokenAmount] of feesByCurrency) {
    await ensureMintFeePrepared(wallet, publicClient, currencyToken, tokenAmount);
  }

  const calls: Array<{ target: `0x${string}`; allowFailure: false; callData: `0x${string}` }> = [];
  for (const [index, input] of inputs.entries()) {
    const predictedFee = predictedFees[index];
    calls.push({
      target: STORY_AENEID_LICENSING_MODULE_ADDRESS,
      allowFailure: false,
      callData: viem.encodeFunctionData({
        abi: licensingModuleAbi,
        functionName: "mintLicenseTokens",
        args: [
          input.licensorIpId,
          STORY_AENEID_PILICENSE_TEMPLATE_ADDRESS,
          BigInt(input.licenseTermsId),
          amount,
          input.receiver,
          royaltyContext,
          predictedFee?.tokenAmount ?? 0n,
          MAX_REVENUE_SHARE,
        ],
      }),
    });
  }

  const callSummary = calls.map((call, index) => ({
    index,
    target: call.target,
    callDataPrefix: call.callData.slice(0, 10),
    callDataLength: call.callData.length,
  }));
  mintDebug("multicall_submit", {
    multicallAddress: STORY_AENEID_MULTICALL3_ADDRESS,
    callCount: calls.length,
    mintCallCount: inputs.length,
    callSummary,
  });
  let txHash: `0x${string}`;
  try {
    txHash = await wallet.walletClient.writeContract({
      account: wallet.account,
      chain: STORY_AENEID_CHAIN,
      address: STORY_AENEID_MULTICALL3_ADDRESS,
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [calls],
    } as never) as `0x${string}`;
  } catch (error) {
    mintError("multicall_submit_failed", error, {
      multicallAddress: STORY_AENEID_MULTICALL3_ADDRESS,
      callCount: calls.length,
      mintCallCount: inputs.length,
      callSummary,
    });
    throw error;
  }
  mintDebug("multicall_submitted", { txHash, callCount: calls.length });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  mintDebug("multicall_receipt", {
    txHash,
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    logCount: receipt.logs.length,
  });
  if (receipt.status !== "success") {
    mintError("multicall_receipt_failed", new Error("license_multicall_mint_failed"), { txHash, status: receipt.status });
    throw new Error("license_multicall_mint_failed");
  }

  const tokenIds: string[] = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== STORY_AENEID_LICENSE_TOKEN_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = viem.decodeEventLog({
        abi: licenseTokenAbi,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics,
      });
      if (
        decoded.args.from.toLowerCase() === viem.zeroAddress &&
        decoded.args.to.toLowerCase() === wallet.account.toLowerCase()
      ) {
        tokenIds.push(decoded.args.tokenId.toString());
      }
    } catch {
      // Ignore non-Transfer logs from the LicenseToken contract.
    }
  }

  mintDebug("license_transfer_events", { txHash, expectedCount: inputs.length, tokenIds });
  if (tokenIds.length !== inputs.length) {
    mintError("license_event_count_mismatch", new Error("license_batch_mint_event_missing"), { txHash, expectedCount: inputs.length, tokenIds });
    throw new Error("license_batch_mint_event_missing");
  }
  const grants = inputs.map((input, index) => {
    const licenseTokenId = tokenIds[index];
    if (!licenseTokenId) throw new Error("license_batch_mint_event_missing");
    return {
      fieldId: input.fieldId,
      licenseTokenId,
      mintTxHash: txHash as `0x${string}`,
    };
  });
  mintDebug("batch_success", { txHash, grants });
  return grants;
}

export async function mintStoryLicenseToken(wallet: PrivyWalletConnection, input: MintStoryLicenseTokenInput) {
  const viem = await import("viem");
  const publicClient = buildStoryPublicClient(viem);
  const licenseTermsId = BigInt(input.licenseTermsId);
  const amount = 1n;
  const royaltyContext = "0x";
  const [currencyToken, tokenAmount] = await publicClient.readContract({
    address: STORY_AENEID_LICENSING_MODULE_ADDRESS,
    abi: licensingModuleAbi,
    functionName: "predictMintingLicenseFee",
    args: [
      input.licensorIpId,
      STORY_AENEID_PILICENSE_TEMPLATE_ADDRESS,
      licenseTermsId,
      amount,
      input.receiver,
      royaltyContext,
    ],
  } as never) as readonly [`0x${string}`, bigint];
  if (tokenAmount > 0n) {
    if (currencyToken.toLowerCase() === viem.zeroAddress) throw new Error("license_fee_currency_missing");
    await ensureErc20Allowance(wallet, publicClient, currencyToken, STORY_AENEID_LICENSING_MODULE_ADDRESS, tokenAmount);
  }
  const args = [
    input.licensorIpId,
    STORY_AENEID_PILICENSE_TEMPLATE_ADDRESS,
    licenseTermsId,
    amount,
    input.receiver,
    royaltyContext,
    tokenAmount,
    MAX_REVENUE_SHARE,
  ] as const;

  const txHash = await wallet.walletClient.writeContract({
    account: wallet.account,
    chain: STORY_AENEID_CHAIN,
    address: STORY_AENEID_LICENSING_MODULE_ADDRESS,
    abi: licensingModuleAbi,
    functionName: "mintLicenseTokens",
    args,
  } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  if (receipt.status !== "success") throw new Error("license_token_mint_failed");
  const tokenIds: string[] = [];

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== STORY_AENEID_LICENSE_TOKEN_ADDRESS.toLowerCase()) continue;
    try {
      const decoded = viem.decodeEventLog({
        abi: licenseTokenAbi,
        eventName: "Transfer",
        data: log.data,
        topics: log.topics,
      });
      if (
        decoded.args.from.toLowerCase() === viem.zeroAddress &&
        decoded.args.to.toLowerCase() === input.receiver.toLowerCase()
      ) {
        tokenIds.push(decoded.args.tokenId.toString());
      }
    } catch {
      // Ignore non-Transfer logs from the LicenseToken contract.
    }
  }

  if (tokenIds.length !== 1) throw new Error("license_token_mint_event_missing");
  return {
    fieldId: input.fieldId,
    licenseTokenId: tokenIds[0]!,
    mintTxHash: txHash as `0x${string}`,
  };
}

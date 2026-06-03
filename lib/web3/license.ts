"use client";

import {
  STORY_AENEID_CHAIN,
  STORY_AENEID_LICENSE_TOKEN_ADDRESS,
  STORY_AENEID_LICENSING_MODULE_ADDRESS,
  STORY_AENEID_MULTICALL3_ADDRESS,
  STORY_AENEID_PILICENSE_TEMPLATE_ADDRESS,
  STORY_AENEID_RPC_URL,
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

export async function mintStoryLicenseTokensBatch(wallet: PrivyWalletConnection, inputs: MintStoryLicenseTokenInput[]) {
  if (!inputs.length) throw new Error("license_batch_empty");

  const viem = await import("viem");
  const publicClient = buildStoryPublicClient(viem);
  const amount = 1n;
  const royaltyContext = "0x";
  const feesByCurrency = new Map<`0x${string}`, bigint>();
  const predictedFees: Array<{ currencyToken: `0x${string}`; tokenAmount: bigint }> = [];

  for (const input of inputs) {
    const licenseTermsId = BigInt(input.licenseTermsId);
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
    predictedFees.push({ currencyToken, tokenAmount });
    if (tokenAmount > 0n) {
      if (currencyToken.toLowerCase() === viem.zeroAddress) throw new Error("license_fee_currency_missing");
      feesByCurrency.set(currencyToken, (feesByCurrency.get(currencyToken) ?? 0n) + tokenAmount);
    }
  }

  for (const [currencyToken, tokenAmount] of feesByCurrency) {
    const allowance = await publicClient.readContract({
      address: currencyToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [wallet.account, STORY_AENEID_MULTICALL3_ADDRESS],
    } as never) as bigint;
    if (allowance < tokenAmount) {
      const approveTxHash = await wallet.walletClient.writeContract({
        account: wallet.account,
        chain: STORY_AENEID_CHAIN,
        address: currencyToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [STORY_AENEID_MULTICALL3_ADDRESS, tokenAmount],
      } as never);
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTxHash as `0x${string}` });
      if (approveReceipt.status !== "success") throw new Error("license_fee_approval_failed");
    }
  }

  const calls: Array<{ target: `0x${string}`; allowFailure: false; callData: `0x${string}` }> = [];
  for (const [currencyToken, tokenAmount] of feesByCurrency) {
    calls.push({
      target: currencyToken,
      allowFailure: false,
      callData: viem.encodeFunctionData({
        abi: erc20Abi,
        functionName: "transferFrom",
        args: [wallet.account, STORY_AENEID_MULTICALL3_ADDRESS, tokenAmount],
      }),
    });
    calls.push({
      target: currencyToken,
      allowFailure: false,
      callData: viem.encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [STORY_AENEID_LICENSING_MODULE_ADDRESS, 0n],
      }),
    });
    calls.push({
      target: currencyToken,
      allowFailure: false,
      callData: viem.encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [STORY_AENEID_LICENSING_MODULE_ADDRESS, tokenAmount],
      }),
    });
  }

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

  const txHash = await wallet.walletClient.writeContract({
    account: wallet.account,
    chain: STORY_AENEID_CHAIN,
    address: STORY_AENEID_MULTICALL3_ADDRESS,
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [calls],
  } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  if (receipt.status !== "success") throw new Error("license_multicall_mint_failed");

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

  if (tokenIds.length !== inputs.length) throw new Error("license_batch_mint_event_missing");
  return inputs.map((input, index) => {
    const licenseTokenId = tokenIds[index];
    if (!licenseTokenId) throw new Error("license_batch_mint_event_missing");
    return {
      fieldId: input.fieldId,
      licenseTokenId,
      mintTxHash: txHash as `0x${string}`,
    };
  });
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
    const allowance = await publicClient.readContract({
      address: currencyToken,
      abi: erc20Abi,
      functionName: "allowance",
      args: [wallet.account, STORY_AENEID_LICENSING_MODULE_ADDRESS],
    } as never) as bigint;
    if (allowance < tokenAmount) {
      const approveTxHash = await wallet.walletClient.writeContract({
        account: wallet.account,
        chain: STORY_AENEID_CHAIN,
        address: currencyToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [STORY_AENEID_LICENSING_MODULE_ADDRESS, tokenAmount],
      } as never);
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTxHash as `0x${string}` });
      if (approveReceipt.status !== "success") throw new Error("license_fee_approval_failed");
    }
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

"use client";

import { createPublicClient, http } from "viem";
import { STORY_AENEID_CHAIN, STORY_AENEID_RPC_URL } from "./network";
import type { PrivyWalletConnection } from "./privy";

export async function sendNativeIpPayment(
  wallet: PrivyWalletConnection,
  input: { recipientWallet: `0x${string}`; amountWei: string },
) {
  const value = BigInt(input.amountWei);
  if (value <= 0n) throw new Error("payment_amount_invalid");

  const publicClient = createPublicClient({
    chain: STORY_AENEID_CHAIN,
    transport: http(STORY_AENEID_RPC_URL),
  });
  const txHash = await wallet.walletClient.sendTransaction({
    account: wallet.account,
    chain: STORY_AENEID_CHAIN,
    to: input.recipientWallet,
    value,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") throw new Error("server_ip_payment_failed");
  return txHash;
}

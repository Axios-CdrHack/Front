"use client";

import { STORY_AENEID_RPC_URL } from "./network";
import type { PrivyWalletConnection } from "./privy";

/**
 * Build a Story SDK client bound to the provided wallet. The SDK uses the
 * `transport` for reads and the `wallet` for writes, so every write the SDK
 * issues goes through `walletClient.writeContract`.
 */
export async function getStoryClient(wallet: PrivyWalletConnection) {
  const [{ StoryClient }, viem] = await Promise.all([
    import("@story-protocol/core-sdk"),
    import("viem"),
  ]);
  return StoryClient.newClient({
    chainId: "aeneid",
    transport: viem.http(STORY_AENEID_RPC_URL),
    wallet: wallet.walletClient as never,
  });
}

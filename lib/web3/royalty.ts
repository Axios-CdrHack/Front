"use client";

import { STORY_AENEID_WIP_TOKEN_ADDRESS } from "./network";
import { getStoryClient } from "./storyClient";
import type { PrivyWalletConnection } from "./privy";

export async function claimFieldRoyalty(wallet: PrivyWalletConnection, input: { ipId: `0x${string}` }) {
  const client = await getStoryClient(wallet);
  const result = await client.royalty.claimAllRevenue({
    ancestorIpId: input.ipId,
    claimer: input.ipId,
    childIpIds: [],
    royaltyPolicies: [],
    currencyTokens: [STORY_AENEID_WIP_TOKEN_ADDRESS],
  });

  return {
    txHashes: result.txHashes,
    claimedTokens: result.claimedTokens.map((token) => ({
      claimer: token.claimer,
      token: token.token,
      amount: token.amount.toString(),
    })),
  };
}

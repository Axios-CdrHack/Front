import type { ConnectedWallet } from "@privy-io/react-auth";
import { createWalletClient, custom, type WalletClient } from "viem";
import { STORY_AENEID_CHAIN } from "./network";

interface Eip1193Provider {
  request(args: { method: string; params?: object | unknown[] }): Promise<unknown>;
}

export type PrivyWalletConnection = {
  account: `0x${string}`;
  walletClient: WalletClient;
};

export function pickPrimaryPrivyWallet(wallets: ConnectedWallet[]) {
  return wallets[0] ?? null;
}

export function isEmbeddedPrivyWallet(wallet: ConnectedWallet) {
  return wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2";
}

export function pickEmbeddedPrivyWallet(wallets: ConnectedWallet[]) {
  return wallets.find(isEmbeddedPrivyWallet) ?? null;
}

export function pickPaymentPrivyWallet(wallets: ConnectedWallet[]) {
  return wallets.find((wallet) => wallet.walletClientType === "metamask") ?? null;
}

export async function getPrivyWalletConnection(wallet: ConnectedWallet): Promise<PrivyWalletConnection> {
  await wallet.switchChain(STORY_AENEID_CHAIN.id);
  const provider = (await wallet.getEthereumProvider()) as Eip1193Provider;

  return {
    account: wallet.address as `0x${string}`,
    walletClient: createWalletClient({
      account: wallet.address as `0x${string}`,
      chain: STORY_AENEID_CHAIN,
      transport: custom(provider),
    }),
  };
}

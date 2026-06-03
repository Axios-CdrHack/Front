"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { STORY_AENEID_CHAIN } from "../../../lib/web3/network";
import { getEmbeddedWalletRecoveryState } from "../../../lib/web3/privyRecovery";

function summarizeLinkedAccount(account: Record<string, unknown>) {
  return {
    type: account.type,
    address: account.address,
    walletClient: account.walletClient ?? account.wallet_client,
    chainType: account.chainType ?? account.chain_type,
    connectorType: account.connectorType ?? account.connector_type,
    recoveryMethod: account.recoveryMethod ?? account.recovery_method,
    providerApp: account.providerApp,
  };
}

function PrivyDebugStateReporter() {
  const { authenticated, ready, user } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const recoveryState = getEmbeddedWalletRecoveryState(user);

  useEffect(() => {
    (window as any).__AXIOS_PRIVY_STATE__ = {
      ready,
      authenticated,
      userId: user?.id,
      hasUser: Boolean(user),
      hasEmail: Boolean(user?.email?.address),
      hasPhone: Boolean(user?.phone?.number),
      hasUserWallet: Boolean(user?.wallet?.address),
      userWalletAddress: user?.wallet?.address,
      embeddedWalletRecoveryMethod: recoveryState.method,
      embeddedWalletRecoverySupported: recoveryState.supported,
      linkedAccounts: (user?.linkedAccounts ?? []).map((account) => summarizeLinkedAccount(account as unknown as Record<string, unknown>)),
      walletsReady,
      wallets: wallets.map((wallet) => {
        const item = wallet as any;
        return {
          address: item.address,
          chainId: item.chainId,
          walletClientType: item.walletClientType,
          connectorType: item.connectorType,
          linked: item.linked,
        };
      }),
    };
    if (process.env.NODE_ENV !== "production") {
      console.debug("[axios-debug] privy_state", (window as any).__AXIOS_PRIVY_STATE__);
    }
  });

  return null;
}

export function WalletProviders({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#090d1f",
          color: "#f6f7ff",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 12px", fontSize: "28px" }}>Privy App ID missing</h1>
          <p style={{ margin: 0, color: "rgba(246, 247, 255, 0.72)" }}>
            Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> in <code>front/.env</code> before opening the app.
          </p>
        </div>
      </main>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        embeddedWallets: {
          createOnLogin: "off",
          requireUserPasswordOnCreate: false,
          showWalletUIs: false,
        },
        defaultChain: STORY_AENEID_CHAIN,
        supportedChains: [STORY_AENEID_CHAIN],
      }}
    >
      <PrivyDebugStateReporter />
      {children}
    </PrivyProvider>
  );
}

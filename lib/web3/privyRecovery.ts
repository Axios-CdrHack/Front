type LinkedPrivyAccount = {
  type?: string;
  address?: string;
  walletClient?: string;
  walletClientType?: string;
  connectorType?: string;
  recoveryMethod?: string;
};

const SUPPORTED_RECOVERY_METHODS = new Set(["privy", "user-passcode", "google-drive", "icloud"]);

export type EmbeddedWalletRecoveryState = {
  method?: string;
  supported: boolean;
};

export function getEmbeddedWalletRecoveryState(user: unknown): EmbeddedWalletRecoveryState {
  const value = user as
    | {
        wallet?: LinkedPrivyAccount;
        linkedAccounts?: LinkedPrivyAccount[];
      }
    | null
    | undefined;

  const isPrivyEmbeddedWallet = (account: LinkedPrivyAccount | undefined) =>
    Boolean(
      account &&
        account.type === "wallet" &&
        (account.walletClientType === "privy" || account.walletClient === "privy" || account.connectorType === "embedded"),
    );
  const embeddedWallet =
    value?.linkedAccounts?.find((account) => isPrivyEmbeddedWallet(account)) ??
    (isPrivyEmbeddedWallet(value?.wallet) ? value?.wallet : undefined);
  const method = embeddedWallet?.recoveryMethod;

  return {
    method,
    supported: !method || SUPPORTED_RECOVERY_METHODS.has(method),
  };
}

export function formatUnsupportedRecoveryMethodMessage(method?: string) {
  return method
    ? `Privy embedded wallet recovery method '${method}' is not supported by the current SDK. Upgrade Privy SDK or update wallet recovery before CDR actions.`
    : "Privy embedded wallet recovery is not supported by the current SDK. Upgrade Privy SDK or update wallet recovery before CDR actions.";
}

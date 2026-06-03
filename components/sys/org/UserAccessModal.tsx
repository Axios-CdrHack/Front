"use client";

import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import "./Modal.scss";

function parseModalError(error: unknown) {
  if (error instanceof Error) {
    if (isWalletConnectionCancelled(error.message)) return "Wallet connection cancelled";
    try {
      const parsed = JSON.parse(error.message) as { error?: string; message?: string };
      const parsedMessage = parsed.message ?? parsed.error ?? "";
      return isWalletConnectionCancelled(parsedMessage) ? "Wallet connection cancelled" : parsedMessage || error.message;
    } catch {
      return error.message;
    }
  }
  return "unknown_error";
}

function isWalletConnectionCancelled(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("user exited before wallet could be connected") ||
    normalized.includes("user rejected") ||
    normalized.includes("user denied") ||
    normalized.includes("rejected the request")
  );
}

export function UserAccessModal(props: {
  open: boolean;
  defaultEmail?: string;
  linkedWalletAddress?: string;
  onClose(): void;
  onWalletLinked(walletAddress: string): void;
}) {
  const { authenticated, login, logout, ready, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { defaultEmail, linkedWalletAddress, onClose, onWalletLinked, open } = props;
  const primaryWallet = wallets[0] ?? null;
  const [status, setStatus] = useState("Continue with Privy to create or connect your wallet.");
  const [busy, setBusy] = useState<"connect" | "logout" | null>(null);

  useEffect(() => {
    if (open) {
      setStatus(
        authenticated
          ? primaryWallet?.address
            ? "Privy wallet ready."
            : "Finishing wallet setup..."
          : "Continue with Privy to create or connect your wallet.",
      );
    }
  }, [authenticated, open, primaryWallet?.address]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    if (authenticated && primaryWallet?.address) {
      onWalletLinked(primaryWallet.address);
    }
  }, [authenticated, onWalletLinked, open, primaryWallet?.address]);

  if (!open) return null;

  const email = user?.email?.address ?? (defaultEmail ?? "").trim();
  const displayWallet = primaryWallet?.address ?? linkedWalletAddress ?? "";
  const loading = !ready || !walletsReady;

  async function handleConnect() {
    setBusy("connect");
    try {
      if (!authenticated) {
        await login();
        setStatus("Privy login complete.");
      } else {
        setStatus(primaryWallet?.address ? "Embedded wallet ready." : "Embedded wallet is still being prepared.");
      }
    } catch (error) {
      setStatus(parseModalError(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleLogout() {
    setBusy("logout");
    try {
      await logout();
      setStatus("Signed out of Privy.");
    } catch (error) {
      setStatus(parseModalError(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="user-modal" role="dialog" aria-modal="true" aria-label="User account">
        <div className="modal-title-line">
          <small>Privy wallet</small>
          <button type="button" onClick={onClose} aria-label="Close user modal">
            ×
          </button>
        </div>

        <label className="profile-input readonly-field">
          <span>Privy user</span>
          <input value={email} readOnly disabled placeholder="Login with Privy first" />
        </label>

        <div className="profile-input readonly-field wallet-inline-field">
          <span>Wallet ready</span>
          <div className="wallet-inline-row">
            <input value={displayWallet} readOnly disabled placeholder="Create or connect a wallet with Privy" />
            <div className="wallet-inline-button">
              <button
                className="modal-primary"
                type="button"
                onClick={() => void handleConnect()}
                disabled={loading || busy === "connect" || Boolean(primaryWallet?.address)}
              >
                {loading ? "Loading..." : primaryWallet?.address ? "Ready" : "Continue"}
              </button>
            </div>
          </div>
        </div>

        <div className="modal-caution">
          <strong>Caution</strong>
          <p>Privy manages login and embedded-wallet provisioning. The active Privy wallet will be used for payout and CDR signatures.</p>
        </div>

        <div className="wallet-connect-box stacked">
          {authenticated ? (
            <button className="modal-primary wide" type="button" onClick={() => void handleLogout()} disabled={busy === "logout"}>
              Sign out of Privy
            </button>
          ) : null}
        </div>

        <p className="modal-status">{status}</p>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { Lock, Search, WalletCards } from "lucide-react";
import { IconAsset } from "./sys/cell/IconAsset";
import "./LandingPage.scss";

const START_APP_REDIRECT_KEY = "axios:start-app-redirect";
const START_APP_REDIRECT_TTL_MS = 5 * 60 * 1000;

function markStartAppRedirect() {
  window.sessionStorage.setItem(START_APP_REDIRECT_KEY, String(Date.now()));
}

function clearStartAppRedirect() {
  window.sessionStorage.removeItem(START_APP_REDIRECT_KEY);
}

function hasStartAppRedirect() {
  const createdAt = Number(window.sessionStorage.getItem(START_APP_REDIRECT_KEY));
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > START_APP_REDIRECT_TTL_MS) {
    clearStartAppRedirect();
    return false;
  }
  return true;
}

export function LandingPage() {
  const router = useRouter();
  const { authenticated, login, ready: privyReady } = usePrivy();
  const [startPending, setStartPending] = useState(false);

  useEffect(() => {
    if (!privyReady || !authenticated) return;
    if (!startPending && !hasStartAppRedirect()) return;
    clearStartAppRedirect();
    setStartPending(false);
    router.replace("/app");
  }, [authenticated, privyReady, router, startPending]);

  async function handleStartApp() {
    if (authenticated) {
      clearStartAppRedirect();
      router.push("/app");
      return;
    }

    markStartAppRedirect();
    setStartPending(true);
    login();
  }

  const startLabel = !privyReady
    ? "Preparing Privy..."
    : startPending
      ? "Opening Privy..."
      : "Start app";

  return (
    <main className="landing-page">
      <header className="landing-header">
        <span className="brand-mark">
          <IconAsset name="logo" size={24} />
          <span>AXIOS</span>
        </span>
        <button type="button" onClick={() => void handleStartApp()}>
          {startLabel}
        </button>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <h1>Earn from the data inside your digital Identiti card.</h1>
          <p>
            Public profile fields power discovery. Contact and sensitive fields stay CDR-gated until a buyer makes a
            batch access request.
          </p>
          <button className="hero-cta" type="button" onClick={() => void handleStartApp()}>
            {startLabel}
          </button>
        </div>

        <div className="landing-card-preview" aria-label="AXIOS card preview">
          <div className="mini-card-header">
            <span className="mini-avatar">J</span>
            <span>
              <strong>Jaine</strong>
              <small>IT Product Manager</small>
            </span>
          </div>
          <div className="preview-card-brand" aria-hidden="true">
            <IconAsset className="preview-card-brand-mark" name="logo" size={124} />
          </div>
          <div className="locked-fields">
            <span>
              <Lock size={14} />
              E-mail CDR
            </span>
            <span>
              <WalletCards size={14} />
              Mobile CDR
            </span>
            <span>
              <Search size={14} />
              Searchable profile
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}

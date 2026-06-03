"use client";

import { useEffect, useState } from "react";
import { compactAddress } from "../../../lib/format";
import "./Modal.scss";

type CdrDeployField = {
  label: string;
  priceCents: number;
  cdrVaultUuid?: string;
  cdrLicenseIpId?: string;
  ipaTokenId?: string;
  statusMessage?: string;
};

function formatPriceInput(priceCents: number) {
  const price = priceCents / 100;
  return Number.isInteger(price) ? String(price) : price.toFixed(2).replace(/\.?0+$/, "");
}

function parsePriceInput(value: string, currentPriceCents: number) {
  if (!value.trim()) return 0;
  const price = Number(value);
  if (!Number.isFinite(price)) return currentPriceCents;
  return Math.max(0, Math.round(price * 100));
}

export function CdrDeployModal(props: {
  busy?: boolean;
  field: CdrDeployField | null;
  open: boolean;
  onClose(): void;
  onConfirm(priceCents: number): void;
}) {
  const { field, open } = props;
  const { onClose } = props;
  const [priceInput, setPriceInput] = useState("");

  useEffect(() => {
    if (!open || !field) return;
    setPriceInput(formatPriceInput(field.priceCents));
  }, [field, open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !props.busy) onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, props.busy]);

  if (!open || !field) return null;

  const nextPriceCents = parsePriceInput(priceInput, field.priceCents);
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="cdr-deploy-modal" role="dialog" aria-modal="true" aria-labelledby="cdr-deploy-modal-title">
        <div className="modal-title-line">
          <h2 id="cdr-deploy-modal-title">{field.label}</h2>
          <button type="button" onClick={props.onClose} aria-label="Close CDR deploy modal" disabled={props.busy}>
            ×
          </button>
        </div>

        <label className="profile-input">
          <span>Price (IP)</span>
          <input
            autoFocus
            disabled={props.busy}
            inputMode="decimal"
            min={0}
            step="0.01"
            type="number"
            value={priceInput}
            onChange={(event) => setPriceInput(event.target.value)}
          />
        </label>

        <div className="cdr-deploy-summary">
          {field.cdrLicenseIpId ? <span>IPA {compactAddress(field.cdrLicenseIpId)}</span> : null}
          {field.ipaTokenId ? <span>NFT #{field.ipaTokenId}</span> : null}
          {field.cdrVaultUuid ? <span>CDR {field.cdrVaultUuid}</span> : null}
        </div>
        {props.busy && field.statusMessage ? (
          <p className="cdr-deploy-status" role="status">
            {field.statusMessage}
          </p>
        ) : null}

        <div className="confirm-modal-actions">
          <button className="modal-secondary" type="button" onClick={props.onClose} disabled={props.busy}>
            Cancel
          </button>
          <button
            className={props.busy ? "modal-primary loading" : "modal-primary"}
            type="button"
            onClick={() => props.onConfirm(nextPriceCents)}
            disabled={props.busy}
            aria-busy={props.busy}
          >
            {props.busy ? <span className="button-spinner" aria-hidden="true" /> : "Deploy"}
          </button>
        </div>
      </section>
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { Droplet, Mail, MessageCircle, Phone, Ruler, Scale, ShieldCheck, WalletCards } from "lucide-react";
import { getPublicCard } from "../../../lib/api";
import { IconAsset } from "../../../components/sys/cell/IconAsset";
import type { PublicCardDataField } from "../../../lib/types";
import "./PublicCardPage.scss";

export const dynamic = "force-dynamic";

function publicCardFieldLabel(field: PublicCardDataField) {
  if (field.kind === "email") return "E-mail";
  if (field.kind === "mobile") return "Mobile";
  if (field.kind === "telegram") return "Telegram";
  if (field.kind === "discord") return "Discord";
  if (field.kind === "twitter") return "Twitter";
  if (field.kind === "insurance") return "Insurance Data";
  if (field.kind === "height") return "Height";
  if (field.kind === "weight") return "Weight";
  if (field.kind === "blood_type") return "Blood Type";
  return field.label;
}

function publicCardFieldIcon(field: PublicCardDataField) {
  if (field.kind === "email") return <Mail size={14} />;
  if (field.kind === "mobile") return <Phone size={14} />;
  if (field.kind === "telegram" || field.kind === "discord" || field.kind === "twitter") return <MessageCircle size={14} />;
  if (field.kind === "insurance") return <ShieldCheck size={14} />;
  if (field.kind === "height") return <Ruler size={14} />;
  if (field.kind === "weight") return <Scale size={14} />;
  if (field.kind === "blood_type") return <Droplet size={14} />;
  return <WalletCards size={14} />;
}

export default async function PublicCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const response = await getPublicCard(slug).catch(() => null);

  if (!response) notFound();

  const profile = response.profile;
  const displayName = profile.displayName || profile.publicFields.name || "AXIOS USER";
  const occupation = profile.publicFields.occupation || "Occupation";
  const visibleDetails = profile.dataFields
    .filter((field) => field.valuePreview)
    .map((field) => ({
      field,
      title: publicCardFieldLabel(field),
      description: field.valuePreview ?? "",
    }));

  return (
    <main className="public-card-page">
      <Link className="public-card-brand" href="/" aria-label="Go to AXIOS landing">
        <IconAsset name="logo" size={26} />
        <span>AXIOS</span>
      </Link>

      <section className="public-card" aria-label={`${displayName} public card`}>
        <div className="public-card-head">
          <div className="public-card-profile">
            <div className="public-avatar">{profile.avatarUrl ? <img alt="" src={profile.avatarUrl} /> : displayName.slice(0, 1)}</div>
            <div className="public-card-id">
              <h1>{displayName}</h1>
              <p>{occupation}</p>
            </div>
          </div>
        </div>

        <div className="public-card-watermark" aria-hidden="true">
          <IconAsset className="public-card-watermark-mark" name="logo" size={150} />
        </div>

        <div className="public-card-details">
          {visibleDetails.map((detail) => (
            <div className="public-card-detail" key={detail.title}>
              {publicCardFieldIcon(detail.field)}
              <strong>{detail.title}</strong>
              <p>{detail.description}</p>
            </div>
          ))}
        </div>
      </section>

      <Link className="public-card-cancel" href="/app">
        Cancel
      </Link>
    </main>
  );
}

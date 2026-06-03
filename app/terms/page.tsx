import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = {
  title: "Terms | AXIOS",
  description: "AXIOS terms for sellers, buyers, CDR access, payments, and hackathon MVP limitations.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of Use"
      updatedAt="May 21, 2026"
      intro="These terms cover the AXIOS hackathon MVP, where people create digital business cards and sell access to selected personal data fields."
      sections={[
        {
          title: "MVP Status",
          body: (
            <p>
              AXIOS is an early demonstration product. Features such as CDR deployment, verification, batch payments,
              exports, privacy controls, and account deletion may be incomplete until production review is finished.
            </p>
          ),
        },
        {
          title: "Seller Responsibilities",
          body: (
            <p>
              Sellers should only publish data they have the right to share. Mobile fields must be verified before CDR
              deployment. Email is tied to your signed-in account and can be deployed without a separate verification step.
              Sensitive or contact fields should be priced and gated intentionally.
            </p>
          ),
        },
        {
          title: "Buyer Responsibilities",
          body: (
            <p>
              Buyers may search public metadata, request batch access, and export data only for lawful business use.
              Buying access to a field does not grant rights beyond the specific paid request and export context.
            </p>
          ),
        },
        {
          title: "CDR And Access",
          body: (
            <p>
              Paid fields are represented by CDR vault metadata and search visibility state. CDR off hides the field from
              search results. CDR on lists the field for paid access through the recorded purchase or batch call.
            </p>
          ),
        },
        {
          title: "Fees",
          body: (
            <p>
              The MVP models a 10% service fee on paid access, with the remaining amount allocated to sellers. Final
              settlement behavior depends on the production contract and payment implementation.
            </p>
          ),
        },
      ]}
    />
  );
}

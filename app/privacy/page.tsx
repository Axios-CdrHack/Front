import type { Metadata } from "next";
import { LegalPage } from "../../components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy | AXIOS",
  description: "AXIOS privacy policy for public profile data, paid CDR fields, verification, and batch access requests.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      updatedAt="May 21, 2026"
      intro="AXIOS is a hackathon MVP for a paid digital business card. This policy explains what data is public, what data is CDR-gated, and what the server stores."
      sections={[
        {
          title: "Public Profile Data",
          body: (
            <p>
              Search uses only the profile fields you publish for discovery: name, gender, age, country, locale, and
              occupation. These fields may appear in public card pages and anonymous search matching.
            </p>
          ),
        },
        {
          title: "Paid Data",
          body: (
            <p>
              Contact and sensitive fields can be marked as paid and deployed to CDR. The server stores metadata such as
              field type, label, price, CDR state, vault UUID, and transaction hash. It should not store paid plaintext
              values.
            </p>
          ),
        },
        {
          title: "Verification",
          body: (
            <p>
              Mobile fields require code verification before CDR deployment. Email is fixed to your signed-in email and
              can be deployed without an additional verification step. Verification providers may process the destination
              address or phone number solely to send and confirm the code.
            </p>
          ),
        },
        {
          title: "Requests And Payments",
          body: (
            <p>
              Buyer requests store reusable search parameters, selected field types, selected anonymous match references,
              totals, payment status, and export logs. Pre-purchase search responses do not expose paid contact values.
            </p>
          ),
        },
        {
          title: "Control",
          body: (
            <p>
              You can turn CDR off for a field to hide it from search, or keep CDR on to list it for paid access.
              Account deletion and advanced privacy controls are placeholders during the hackathon phase.
            </p>
          ),
        },
      ]}
    />
  );
}

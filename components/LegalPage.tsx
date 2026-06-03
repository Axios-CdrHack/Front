import type { ReactNode } from "react";
import { IconAsset } from "./sys/cell/IconAsset";
import "./LegalPage.scss";

type LegalSection = {
  title: string;
  body: ReactNode;
};

type LegalPageProps = {
  eyebrow: string;
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
};

export function LegalPage({ eyebrow, title, updatedAt, intro, sections }: LegalPageProps) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <a className="brand-mark" href="/app" aria-label="AXIOS app">
          <IconAsset name="logo" size={24} />
          <span>AXIOS</span>
        </a>
        <a className="legal-back" href="/app">
          Open app
        </a>
      </header>

      <article className="legal-document">
        <p className="legal-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-updated">Last updated: {updatedAt}</p>
        <p className="legal-intro">{intro}</p>

        <div className="legal-sections">
          {sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <div>{section.body}</div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}

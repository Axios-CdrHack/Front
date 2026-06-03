import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RuntimeDebugLogger } from "../components/sys/org/RuntimeDebugLogger";
import { WalletProviders } from "../components/sys/org/WalletProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "AXIOS",
  description: "Earn from the data inside your digital business card.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <RuntimeDebugLogger />
        <WalletProviders>{children}</WalletProviders>
      </body>
    </html>
  );
}

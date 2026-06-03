import { redirect } from "next/navigation";
import type { Route } from "next";

export default async function LegacyCardPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  redirect(`/c/${handle}` as Route);
}

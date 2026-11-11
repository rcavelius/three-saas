import type { Metadata } from "next";
import { AcceptInvitation } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Team invitation", robots: { index: false } };

export default async function AcceptInvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AcceptInvitation id={id} />;
}

import type { Metadata } from "next";
import { Inspector } from "@/components/inspector/Inspector";

export const metadata: Metadata = {
  title: "Inspector",
  robots: { index: false, follow: false },
};

export default async function InspectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Inspector endpointId={id} />;
}

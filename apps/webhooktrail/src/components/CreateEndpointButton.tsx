"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { track } from "@/lib/track";
import type { EndpointDTO } from "@/lib/types";

export function CreateEndpointButton({ size = "lg" }: { size?: "lg" | "sm" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { endpoint } = await api<{ endpoint: EndpointDTO }>("/api/endpoints", { method: "POST", body: {} });
      track("tool_used", { tool: "create_endpoint" });
      router.push(`/e/${endpoint.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create an endpoint. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={create}
        disabled={busy}
        className={`btn btn-signal ${size === "lg" ? "h-11 px-5 text-[15px]" : ""}`}
      >
        {busy ? "Creating…" : "Create endpoint"}
        <span aria-hidden className="font-mono">→</span>
      </button>
      {error && (
        <p role="alert" className="text-[13px] text-err max-w-md">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { track } from "@/lib/track";
import type { EndpointDTO } from "@/lib/types";
import { PassPaywall } from "./pass/PassPaywall";

export function CreateEndpointButton({ size = "lg", full = false }: { size?: "lg" | "sm"; full?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    setLimitHit(false);
    try {
      const { endpoint } = await api<{ endpoint: EndpointDTO }>("/api/endpoints", { method: "POST", body: {} });
      track("tool_used", { tool: "create_endpoint" });
      router.push(`/e/${endpoint.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create an endpoint. Check your connection.");
      // At the free endpoint limit: offer the pass (only when it actually raises this owner's limit).
      setLimitHit(e instanceof ApiError && e.code === "endpoint_limit" && e.data.passAvailable === true);
      setBusy(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${full ? "items-stretch sm:items-start" : "items-start"}`}>
      <button
        type="button"
        onClick={create}
        disabled={busy}
        className={`btn btn-signal rounded-[10px] ${size === "lg" ? "h-12 px-5 text-[15px] sm:h-11" : ""} ${full ? "justify-center sm:justify-start" : ""}`}
      >
        {busy ? "Creating…" : "Create endpoint"}
        <span aria-hidden className="font-mono">→</span>
      </button>
      {error && (
        <p role="alert" className="text-[13px] text-err max-w-md">
          {error}
        </p>
      )}
      {limitHit && <PassPaywall reason="endpoint_limit" onClose={() => setLimitHit(false)} className="max-w-xl mt-2" />}
    </div>
  );
}

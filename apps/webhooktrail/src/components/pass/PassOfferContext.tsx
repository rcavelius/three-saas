"use client";

import { createContext, useContext } from "react";
import type { PassOffer } from "@/lib/types";

const Ctx = createContext<PassOffer | null>(null);

/** Provides the pass offer (catalog values computed on the server) to client components. */
export function PassOfferProvider({ offer, children }: { offer: PassOffer; children: React.ReactNode }) {
  return <Ctx.Provider value={offer}>{children}</Ctx.Provider>;
}

export function usePassOffer(): PassOffer | null {
  return useContext(Ctx);
}

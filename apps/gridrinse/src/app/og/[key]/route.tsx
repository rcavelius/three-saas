import { ImageResponse } from "next/og";
import { getTool } from "@/content/tools";

export const runtime = "nodejs";

const INK = "#0a0a0a";
const COBALT = "#1e3bff";
const LIME = "#c6ff3a";
const PINK = "#ff7ccf";
const WHITE = "#ffffff";

/** 1200×630 social card. Text comes only from our own content (a tool's h1), never from the request. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const slug = key.replace(/\.png$/, "");
  const tool = slug === "default" ? null : getTool(slug);
  if (slug !== "default" && !tool) return new Response("Not found", { status: 404 });
  const title = tool ? tool.h1 : "Clean a messy CSV or Excel file in seconds.";
  const eyebrow = tool ? "Free tool · no upload · no account" : "Free · runs in your browser · no upload";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: COBALT, padding: 56, fontFamily: "sans-serif", color: INK }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", flexWrap: "wrap", width: 60, height: 60, gap: 6 }}>
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} style={{ width: 16, height: 16, background: i === 5 ? WHITE : LIME, border: `2px solid ${INK}`, borderRadius: 3 }} />
            ))}
          </div>
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1.5, color: WHITE }}>GridRinse</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", background: WHITE, border: `5px solid ${INK}`, borderRadius: 22, boxShadow: `14px 14px 0 ${INK}`, padding: "40px 48px", marginRight: 14 }}>
          <div style={{ fontSize: 28, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{eyebrow}</div>
          <div style={{ fontSize: title.length > 48 ? 62 : 74, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, marginTop: 14 }}>{title}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700, color: WHITE }}>
          <div style={{ display: "flex", color: INK, background: PINK, border: `4px solid ${INK}`, borderRadius: 12, padding: "8px 18px" }}>Your file never leaves your browser</div>
          <div>gridrinse.com</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=86400, s-maxage=604800" } },
  );
}

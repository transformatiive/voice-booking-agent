import { ACCENT_BRIGHT, DISPLAY, INK } from "@/lib/brand";

export function Wordmark({ size = 25, color = INK }: { size?: number; color?: string }) {
  const cap = Math.round(size * 0.72);
  const bar = Math.max(3, Math.round(cap / 4.5));
  return (
    <span style={{ display: "flex", alignItems: "flex-end", gap: size > 22 ? 3 : 2 }}>
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontSize: size,
          letterSpacing: "-0.04em",
          lineHeight: 0.72,
          color,
        }}
      >
        ATEND
      </span>
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          width: Math.round(cap * 1.05),
          height: cap,
        }}
      >
        {["100%", "66%", "88%"].map((w) => (
          <i
            key={w}
            style={{ display: "block", height: bar, width: w, borderRadius: 99, background: ACCENT_BRIGHT }}
          />
        ))}
      </span>
    </span>
  );
}

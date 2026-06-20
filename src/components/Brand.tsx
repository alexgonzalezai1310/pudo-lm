import darkLeroyAsset from "@/assets/logos/leroy_merlin_dark.png.asset.json";

const pudoLogo = "/logos/pudo_logo.png";
const leroyLogo = "/logos/leroy_merlin_logo.png";

export const LEROY_GREEN = "#7AC143";

export function BrandLogos({
  size = 28,
  gap = 10,
  theme = "light",
}: {
  size?: number;
  gap?: number;
  theme?: "dark" | "light";
}) {
  const leroySrc = theme === "dark" ? darkLeroyAsset.url : leroyLogo;

  return (
    <div className="flex items-center" style={{ gap }}>
      <img
        src={pudoLogo}
        alt="PUDO"
        style={{ height: size, width: "auto", objectFit: "contain" }}
      />
      <span
        aria-hidden
        style={{ height: size * 0.7, width: 1, background: "rgba(255,255,255,0.2)" }}
      />
      <img
        src={leroySrc}
        alt="Leroy Merlin"
        style={{ height: size, width: "auto", objectFit: "contain" }}
      />
    </div>
  );
}

export function BrandText({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      <span style={{ color: "var(--primary)" }}>PUDO</span>{" "}
      <span style={{ color: LEROY_GREEN }}>&amp; Leroy Merlin</span>
    </span>
  );
}

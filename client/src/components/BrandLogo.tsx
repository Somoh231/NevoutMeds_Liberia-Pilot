import type { CSSProperties } from "react";

type Props = {
  height?: number;
  className?: string;
  /** e.g. for nav bars */
  style?: CSSProperties;
};

/**
 * Official NevOut Meds mark (from brand assets in `client/public/brand/`).
 */
export default function BrandLogo({ height = 34, className, style }: Props) {
  return (
    <img
      className={className}
      src="/brand/nevoutmeds-logo-256.png"
      srcSet="/brand/nevoutmeds-logo-512.png 2x"
      alt="NevOut Meds"
      height={height}
      width={Math.round(height * 3.2)}
      loading="eager"
      decoding="async"
      style={{
        height,
        width: "auto",
        maxWidth: "100%",
        objectFit: "contain",
        display: "block",
        flexShrink: 0,
        ...style
      }}
    />
  );
}

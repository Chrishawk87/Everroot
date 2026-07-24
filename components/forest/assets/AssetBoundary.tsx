"use client";

import React from "react";

/**
 * Error boundary + Suspense wrapper for anything that loads a production asset.
 *
 * The governing rule for EverRoot is: never fall back to a placeholder
 * primitive. So while an asset streams in we render `nothing` (a transparent
 * gap), and if the file is missing or fails to decode we also render nothing
 * and log a hint — the scene simply omits that element rather than showing a
 * fake stand-in. Once the real file is installed it appears automatically.
 */
class AssetErrorBoundary extends React.Component<
  { children: React.ReactNode; label?: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn(
      `[everroot/assets] "${this.props.label ?? "asset"}" not available yet — ` +
        `omitting it (no placeholder). Install the file per ASSETS.md.`,
      error,
    );
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function AssetBoundary({
  children,
  label,
  fallback = null,
}: {
  children: React.ReactNode;
  label?: string;
  /** Optional non-primitive placeholder (e.g. a soft light). Defaults to null. */
  fallback?: React.ReactNode;
}) {
  return (
    <AssetErrorBoundary label={label}>
      <React.Suspense fallback={fallback}>{children}</React.Suspense>
    </AssetErrorBoundary>
  );
}

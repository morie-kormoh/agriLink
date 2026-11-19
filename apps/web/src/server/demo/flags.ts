/**
 * Presentation switches for the challenge MVP (see docs/mvp/scope.md). Both are off by default.
 *
 *   DEMO_MODE=true  (also on with MVP_MODE=true or `pnpm dev`; force off with DEMO_MODE=false)
 *                   public demo only: fixed sign-in code, one-click personas, SMS panel, "Reset demo".
 *                   Never on a deployment with real farmers' data — anyone could sign in as anyone.
 *   MVP_MODE=true   shows only the MVP screens in the menus and sends recorded purchases straight
 *                   to the manager for approval. Hidden pages still work by URL; nothing is removed.
 */
export const isDemoMode = () => {
  if (process.env.NODE_ENV === "test" || process.env.DEMO_MODE === "false") return false;
  // On for the challenge demo: explicitly, with MVP_MODE, or when running locally (pnpm dev).
  return (
    process.env.DEMO_MODE === "true" ||
    process.env.MVP_MODE === "true" ||
    process.env.NODE_ENV === "development"
  );
};
export const isMvpMode = () => process.env.MVP_MODE === "true";

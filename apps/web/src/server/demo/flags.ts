/**
 * Presentation switches for the challenge MVP (see docs/mvp/scope.md).
 *
 *   DEMO_MODE       ON by default for now (any MVP_MODE); turn off with DEMO_MODE=false
 *                   public demo only: fixed sign-in code, one-click personas, SMS panel, "Reset demo".
 *                   Never on a deployment with real farmers' data — anyone could sign in as anyone.
 *   MVP_MODE=true   shows only the MVP screens in the menus and sends recorded purchases straight
 *                   to the manager for approval. Hidden pages still work by URL; nothing is removed.
 */
export const isDemoMode = () => {
  if (process.env.NODE_ENV === "test") return false;
  // TEMPORARY for the challenge demo: on everywhere unless DEMO_MODE=false is set.
  // Set DEMO_MODE=false before any real farmer's data goes on a deployment.
  return process.env.DEMO_MODE !== "false";
};
export const isMvpMode = () => process.env.MVP_MODE === "true";

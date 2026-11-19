import { config } from "@agrilink/config/eslint";

export default [
  ...config({ react: true }),
  { ignores: ["playwright-report/**", "test-results/**"] },
];

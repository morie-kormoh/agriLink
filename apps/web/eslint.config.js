import { config } from "@agripay/config/eslint";

export default [
  ...config({ react: true }),
  { ignores: ["playwright-report/**", "test-results/**"] },
];

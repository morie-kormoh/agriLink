import path from "node:path";
import { config as loadEnv } from "dotenv";
import { buildApp } from "./app";

loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });

const app = buildApp();
const port = Number(process.env.USSD_PORT ?? 4000);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

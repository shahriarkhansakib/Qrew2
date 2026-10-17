import "dotenv/config";
import { serve } from "@hono/node-server";
import app from "./index";
import { logger } from "./infra/lib/logger";

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";

const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname: host,
  },
  (info) => {
    logger.info(
      { module: "server", port: info.port, address: info.address },
      `🚀 Standalone Qrew API listening on http://${info.address}:${info.port}`,
    );
  },
);

const shutdown = () => {
  logger.info({ module: "server" }, "Stopping standalone server...");
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

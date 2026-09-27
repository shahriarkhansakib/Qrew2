import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

function createLogger() {
  if (isDev) {
    try {
      // Use synchronous stream to prevent thread-stream / worker_threads MODULE_NOT_FOUND in Next.js
      const pretty = require("pino-pretty");
      return pino(
        { level: "debug" },
        pretty({
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname,module,method,path,status,ms",
          singleLine: true,
          messageFormat: "{module} | {msg}",
        }),
      );
    } catch {
      return pino({ level: "debug" });
    }
  }
  return pino({ level: "info" });
}

export const logger = createLogger();

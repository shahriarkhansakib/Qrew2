import Redis from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";
import { logger } from "./logger";

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is not set.");
}

const isDev = process.env.NODE_ENV === "development";

// ─────────────────────────────────────────────────────────────────────────────
// Local ioredis (dev)
//
// enableOfflineQueue: true (the default) — queues commands while the TCP
// connection is being established so that requests arriving before the
// first "ready" event are not thrown with "Stream isn't writeable".
//
// This is safe in dev because ioredis will drain the queue automatically
// once the socket connects. We keep maxRetriesPerRequest low so hanging
// commands don't pile up indefinitely if Redis is genuinely down.
// ─────────────────────────────────────────────────────────────────────────────
const localRedis = isDev
  ? new Redis(process.env.REDIS_URL, {
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    })
  : null;

// In Prod, use Upstash (HTTP) to prevent Serverless connection exhaustion
const prodRedis = !isDev
  ? new UpstashRedis({
      url: process.env.UPSTASH_URL!,
      token: process.env.UPSTASH_TOKEN!,
    })
  : null;

const redisLog = logger.child({ module: "redis" });

if (localRedis) {
  // Only log the first successful connection to avoid noise from multiple
  // Next.js worker processes all firing their "connect" events.
  let connectedOnce = false;
  localRedis.on("connect", () => {
    if (!connectedOnce) {
      connectedOnce = true;
      redisLog.info("connected (local)");
    }
  });

  localRedis.on("error", (err: Error) => {
    // Suppress the transient "Connection is closed" errors that fire
    // during the initial TCP handshake before the socket is ready.
    if (
      err.message.includes("Connection is closed") ||
      err.message.includes("Stream isn't writeable")
    ) {
      return; // suppress — ioredis will retry automatically
    }
    redisLog.error({ err: err.message }, "error (local)");
  });

  localRedis.on("reconnecting", () => {
    redisLog.warn("reconnecting (local)...");
  });
}

/**
 * Smart Wrapper (Adapter Pattern) for Redis
 * Implements the exact interface used by the app to seamlessly
 * switch between ioredis and Upstash.
 */
export const redis = {
  get: async (key: string) => isDev ? localRedis!.get(key) : prodRedis!.get(key),
  set: async (key: string, val: any, ex?: any, ttl?: any) => {
    if (isDev) {
      if (ex && ttl) {
        return localRedis!.set(key, val, ex, ttl);
      }
      return localRedis!.set(key, val);
    } else {
      if (ttl) {
        return prodRedis!.set(key, val, { ex: ttl });
      }
      return prodRedis!.set(key, val);
    }
  },
  del: async (key: string) => isDev ? localRedis!.del(key) : prodRedis!.del(key),
  incr: async (key: string) => isDev ? localRedis!.incr(key) : prodRedis!.incr(key),
  expire: async (key: string, ttl: number) => isDev ? localRedis!.expire(key, ttl) : prodRedis!.expire(key, ttl),
  smembers: async (key: string) => isDev ? localRedis!.smembers(key) : prodRedis!.smembers(key) as Promise<string[]>,
  ping: async () => isDev ? localRedis!.ping() : prodRedis!.ping(),
  pipeline: () => {
    if (isDev) {
      const p = localRedis!.pipeline();
      return {
        sadd: (key: string, member: any, ...members: any[]) => { p.sadd(key, member, ...members); return p; },
        expire: (key: string, ttl: number) => { p.expire(key, ttl); return p; },
        exec: () => p.exec(),
      };
    } else {
      const p = prodRedis!.pipeline();
      return {
        sadd: (key: string, member: any, ...members: any[]) => { p.sadd(key, member, ...members); return p; },
        expire: (key: string, ttl: number) => { p.expire(key, ttl); return p; },
        exec: () => p.exec(),
      };
    }
  },
};

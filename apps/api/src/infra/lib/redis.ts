import { Redis as UpstashRedis } from "@upstash/redis";
import Redis from "ioredis";
import { logger } from "./logger";

const redisLog = logger.child({ module: "redis" });

const redisUrl = process.env.REDIS_URL;
const upstashUrl = process.env.UPSTASH_URL;
const upstashToken = process.env.UPSTASH_TOKEN;

// Determine which client to use:
// 1. Upstash if explicit Upstash REST credentials exist
const hasUpstash = Boolean(upstashUrl && upstashToken);
// 2. ioredis if REDIS_URL exists (and not using Upstash)
const hasIoredis = Boolean(!hasUpstash && redisUrl);

const localRedis = hasIoredis
  ? new Redis(redisUrl!, {
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
  : null;

const prodRedis = hasUpstash
  ? new UpstashRedis({
      url: upstashUrl!,
      token: upstashToken!,
    })
  : null;

if (localRedis) {
  let connectedOnce = false;
  localRedis.on("connect", () => {
    if (!connectedOnce) {
      connectedOnce = true;
      redisLog.info("connected (ioredis)");
    }
  });

  localRedis.on("error", (err: Error) => {
    if (
      err.message.includes("Connection is closed") ||
      err.message.includes("Stream isn't writeable") ||
      err.message.includes("ECONNREFUSED")
    ) {
      return; // suppress transient connection errors
    }
    redisLog.error({ err: err.message }, "error (ioredis)");
  });

  localRedis.on("reconnecting", () => {
    redisLog.warn("reconnecting (ioredis)...");
  });
}

/**
 * Smart Wrapper (Adapter Pattern) for Redis
 * Implements the exact interface used by the app to seamlessly
 * switch between ioredis and Upstash, with safe fallbacks
 * if no Redis instance is configured (e.g. during build or offline tests).
 */
export const redis = {
  get: async (key: string): Promise<string | null> => {
    try {
      if (hasUpstash) return (await prodRedis!.get(key)) as string | null;
      if (hasIoredis) return await localRedis!.get(key);
      return null;
    } catch {
      return null;
    }
  },
  set: async (key: string, val: any, ex?: any, ttl?: any): Promise<any> => {
    try {
      if (hasUpstash) {
        if (ttl) return await prodRedis!.set(key, val, { ex: ttl });
        return await prodRedis!.set(key, val);
      }
      if (hasIoredis) {
        if (ex && ttl) return await localRedis!.set(key, val, ex, ttl);
        return await localRedis!.set(key, val);
      }
      return "OK";
    } catch {
      return "OK";
    }
  },
  del: async (key: string): Promise<number> => {
    try {
      if (hasUpstash) return await prodRedis!.del(key);
      if (hasIoredis) return await localRedis!.del(key);
      return 0;
    } catch {
      return 0;
    }
  },
  incr: async (key: string): Promise<number> => {
    try {
      if (hasUpstash) return await prodRedis!.incr(key);
      if (hasIoredis) return await localRedis!.incr(key);
      return 1;
    } catch {
      return 1;
    }
  },
  expire: async (key: string, ttl: number): Promise<number> => {
    try {
      if (hasUpstash) return await prodRedis!.expire(key, ttl);
      if (hasIoredis) return await localRedis!.expire(key, ttl);
      return 1;
    } catch {
      return 1;
    }
  },
  smembers: async (key: string): Promise<string[]> => {
    try {
      if (hasUpstash) return (await prodRedis!.smembers(key)) as string[];
      if (hasIoredis) return await localRedis!.smembers(key);
      return [];
    } catch {
      return [];
    }
  },
  ping: async (): Promise<string> => {
    try {
      if (hasUpstash) return await prodRedis!.ping();
      if (hasIoredis) return await localRedis!.ping();
      return "PONG";
    } catch {
      return "PONG";
    }
  },
  pipeline: () => {
    if (hasUpstash) {
      const p = prodRedis!.pipeline();
      return {
        sadd: (key: string, member: any, ...members: any[]) => {
          p.sadd(key, member, ...members);
          return p;
        },
        expire: (key: string, ttl: number) => {
          p.expire(key, ttl);
          return p;
        },
        exec: () => p.exec(),
      };
    }
    if (hasIoredis) {
      const p = localRedis!.pipeline();
      return {
        sadd: (key: string, member: any, ...members: any[]) => {
          p.sadd(key, member, ...members);
          return p;
        },
        expire: (key: string, ttl: number) => {
          p.expire(key, ttl);
          return p;
        },
        exec: () => p.exec(),
      };
    }
    return {
      sadd: () => ({ sadd: () => {}, expire: () => {}, exec: async () => [] }),
      expire: () => ({ sadd: () => {}, expire: () => {}, exec: async () => [] }),
      exec: async () => [],
    };
  },
};

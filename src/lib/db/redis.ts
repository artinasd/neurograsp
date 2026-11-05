import { Redis } from "@upstash/redis";
import { getEnv } from "@/lib/env";

const env = getEnv();

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN
});

export const KEYS = {
  owner: "ng:owner:v1",
  setupMeta: "ng:meta:v1",
  sessionPrefix: "ng:session:v1:"
} as const;
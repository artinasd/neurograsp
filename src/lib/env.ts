import { z } from "zod";

const envSchema = z.object({
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  PANEL_CREDENTIALS_ENCRYPTION_KEY: z.string().min(32),
  APP_URL: z.string().url().default("http://localhost:3000")
});

export function getEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const names = result.error.issues.map(issue => issue.path.join(".")).join(", ");
    throw new Error("Missing or invalid server environment variables: " + names);
  }
  return result.data;
}
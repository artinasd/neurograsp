import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const scrypt = (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number }
): Promise<Buffer> => new Promise((resolve, reject) => {
  scryptCallback(password, salt, keyLength, options, (error, derived) => {
    if (error) reject(error);
    else resolve(derived);
  });
});
const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: 64 * 1024 * 1024
  }) as Buffer;
  return ["scrypt", COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), derived.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (n !== COST || r !== BLOCK_SIZE || p !== PARALLELIZATION) return false;

  try {
    const salt = Buffer.from(parts[4], "base64url");
    const expected = Buffer.from(parts[5], "base64url");
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
    const actual = await scrypt(password, salt, KEY_LENGTH, {
      N: n,
      r,
      p,
      maxmem: 64 * 1024 * 1024
    }) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
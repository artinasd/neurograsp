const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

// Load the real TypeScript module after transpiling it to a temporary CommonJS
// file. This keeps the tests dependency-light and exercises production code.
const sourcePath = path.join(__dirname, "..", "src", "lib", "panels", "url.ts");
const tempPath = path.join(os.tmpdir(), `neurograsp-panel-url-${process.pid}.cjs`);
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
fs.writeFileSync(tempPath, compiled);
const { isPrivateIPv4, validatePanelBaseUrl } = require(tempPath);

test("rejects IPv4 non-global and special-purpose ranges", () => {
  for (const ip of [
    "0.0.0.1", "10.1.2.3", "100.64.0.1", "100.127.255.254",
    "127.0.0.1", "169.254.1.1", "172.16.0.1", "172.31.255.254",
    "192.0.0.9", "192.0.2.1", "192.88.99.1", "192.168.1.1",
    "198.18.0.1", "198.19.255.254", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "240.0.0.1",
  ]) assert.equal(isPrivateIPv4(ip), true, `${ip} should be rejected`);
});

test("does not overreject unrelated 192.0/16 and 192.2/16 addresses", () => {
  for (const ip of ["192.0.1.1", "192.2.0.1", "192.2.255.254"]) {
    assert.equal(isPrivateIPv4(ip), false, `${ip} should remain eligible`);
  }
});

test("rejects malformed IPv4 input", () => {
  for (const ip of ["", "1.2.3", "256.1.1.1", "1.2.3.999", "1.2.a.4"]) {
    assert.equal(isPrivateIPv4(ip), true, `${ip} should be rejected`);
  }
});

test("accepts public IPv4 panel URLs and normalizes trailing slash", async () => {
  assert.equal(await validatePanelBaseUrl("  https://8.8.8.8:8443/panel/  "), "https://8.8.8.8:8443/panel");
});

test("rejects private, reserved, and IPv6 literal panel URLs", async () => {
  for (const url of ["https://127.0.0.1", "https://192.0.0.9", "https://[::1]"]) {
    await assert.rejects(validatePanelBaseUrl(url), Error, url);
  }
});

test("rejects insecure URLs and embedded credentials or URL parameters", async () => {
  for (const url of [
    "http://8.8.8.8", "https://user:pass@8.8.8.8",
    "https://8.8.8.8?token=x", "https://8.8.8.8#fragment",
  ]) {
    await assert.rejects(validatePanelBaseUrl(url), Error, url);
  }
});

test("cleans up temporary compiled module", () => {
  fs.rmSync(tempPath, { force: true });
});

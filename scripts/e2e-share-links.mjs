#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:3000";
const PASSWORD = "correct horse battery staple";
const WRONG_PASSWORD = "wrong horse battery";
const FORBIDDEN_PUBLIC_KEYS = new Set([
  "connectionId",
  "credentialVersion",
  "encryptedSecret",
  "generatedQuery",
  "ownerUserId",
  "passwordHash",
  "queryDefinition",
  "queryRunId",
  "sql",
  "tokenHash",
]);

const config = {
  baseUrl: (process.env.E2E_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
  dashboardId: process.env.E2E_DASHBOARD_ID,
  authCookie: process.env.E2E_AUTH_COOKIE,
};

const createdLinks = new Map();
const results = [];

function redact(value) {
  if (!value) return value;
  return String(value).replace(/([A-Za-z0-9_-]{8})[A-Za-z0-9_-]+([A-Za-z0-9_-]{6})/g, "$1...$2");
}

function logPass(label) {
  results.push({ label, status: "PASS" });
  console.log(`PASS ${label}`);
}

function logFail(label, error) {
  results.push({ label, status: "FAIL" });
  console.error(`FAIL ${label}`);
  console.error(error instanceof Error ? error.message : error);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoStore(response, label) {
  const cacheControl = response.headers.get("cache-control") || "";
  assert(cacheControl.toLowerCase().includes("no-store"), `${label} must send Cache-Control: no-store`);
}

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`${name} is required. Example: ${name}=... npm run e2e:share-links`);
  }
}

function ownerHeaders(extra = {}) {
  return {
    Accept: "application/json",
    Cookie: config.authCookie,
    ...extra,
  };
}

function jsonHeaders(extra = {}) {
  return ownerHeaders({
    "Content-Type": "application/json",
    ...extra,
  });
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response, got: ${text.slice(0, 300)}`);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    redirect: "manual",
    ...options,
  });
  const payload = await parseJson(response);
  return { response, payload };
}

function unwrapData(payload, label) {
  assert(payload && typeof payload === "object", `${label} returned an empty payload`);
  assert(payload.contractVersion === "querywise.v2", `${label} returned unexpected contract version`);
  assert("data" in payload, `${label} did not return a data envelope`);
  return payload.data;
}

function expectApiError(payload, code, label) {
  assert(payload && typeof payload === "object", `${label} returned an empty error payload`);
  assert(payload.contractVersion === "querywise.v2", `${label} returned unexpected contract version`);
  assert(payload.error?.code === code, `${label} expected ${code}, got ${payload.error?.code || "missing code"}`);
  return payload.error;
}

function tokenFromShareUrl(url) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  assert(parts[0] === "shared" && parts[1], `Unexpected share URL path: ${redact(url)}`);
  return decodeURIComponent(parts[1]);
}

function assertShareLink(link, label) {
  assert(link && typeof link === "object", `${label} link is missing`);
  assert(typeof link.id === "string" && link.id.length > 0, `${label} link.id is missing`);
  assert(link.urlAvailable === true, `${label} urlAvailable must be true`);
  assert(typeof link.url === "string" && link.url.includes("/shared/"), `${label} url is missing`);
  assert(typeof link.viewCount === "number", `${label} viewCount is missing`);
  assert(typeof link.createdAt === "string", `${label} createdAt is missing`);
  assert(typeof link.updatedAt === "string", `${label} updatedAt is missing`);
}

function findForbiddenPublicKeys(value, path = "$", found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenPublicKeys(item, `${path}[${index}]`, found));
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) found.push(childPath);
    findForbiddenPublicKeys(child, childPath, found);
  }
  return found;
}

function assertPublicDashboard(payload, label) {
  assert(payload && typeof payload === "object", `${label} payload is missing`);
  assert(payload.contractVersion === "querywise.v2", `${label} contract version is missing`);
  assert(payload.dashboard && typeof payload.dashboard.name === "string", `${label} dashboard title is missing`);
  assert(Array.isArray(payload.dashboard.widgets), `${label} widgets must be an array`);
  for (const widget of payload.dashboard.widgets) {
    assert(typeof widget.id === "string", `${label} widget.id is missing`);
    assert(typeof widget.title === "string", `${label} widget.title is missing`);
    assert(widget.chartConfig && typeof widget.chartConfig === "object", `${label} chartConfig is missing`);
    assert(widget.layout && typeof widget.layout === "object", `${label} layout is missing`);
    assert("result" in widget, `${label} widget result field is missing`);
    assert("error" in widget, `${label} widget error field is missing`);
  }
  const forbidden = findForbiddenPublicKeys(payload);
  assert(
    forbidden.length === 0,
    `${label} public payload leaked forbidden fields: ${forbidden.join(", ")}`,
  );
}

async function listShares() {
  const { response, payload } = await request(`/api/dashboards/${encodeURIComponent(config.dashboardId)}/shares`, {
    headers: ownerHeaders(),
  });
  assert(response.status === 200, `List shares expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
  assertNoStore(response, "List shares");
  const data = unwrapData(payload, "List shares");
  assert(Array.isArray(data.links), "List shares data.links must be an array");
  return data;
}

async function createShare(body, label) {
  const { response, payload } = await request(`/api/dashboards/${encodeURIComponent(config.dashboardId)}/shares`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  assert(response.status === 201, `${label} expected 201, got ${response.status}: ${JSON.stringify(payload)}`);
  assertNoStore(response, label);
  const data = unwrapData(payload, label);
  assert(data.type === "link", `${label} expected link share response`);
  assertShareLink(data.link, label);
  createdLinks.set(data.link.id, { ...data.link, label });
  return data.link;
}

async function revokeShare(link, label) {
  const { response, payload } = await request(
    `/api/dashboards/${encodeURIComponent(config.dashboardId)}/shares/${encodeURIComponent(link.id)}`,
    {
      method: "DELETE",
      headers: ownerHeaders(),
    },
  );
  assert(response.status === 204, `${label} revoke expected 204, got ${response.status}: ${JSON.stringify(payload)}`);
  assertNoStore(response, `${label} revoke`);
  createdLinks.delete(link.id);
}

async function fetchPublic(token, cookie) {
  return request(`/api/public/shares/${encodeURIComponent(token)}`, {
    headers: {
      Accept: "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
}

async function unlockPublic(token, password) {
  return request(`/api/public/shares/${encodeURIComponent(token)}/unlock`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
}

async function cleanup() {
  if (createdLinks.size === 0) return;
  console.log("Cleaning up generated share links...");
  for (const link of [...createdLinks.values()]) {
    try {
      await revokeShare(link, `Cleanup ${link.label}`);
      console.log(`PASS cleanup revoked ${link.label} (${link.id})`);
    } catch (error) {
      console.error(`FAIL cleanup could not revoke ${link.label} (${link.id})`);
      console.error(error instanceof Error ? error.message : error);
    }
  }
}

async function runStep(label, fn) {
  try {
    const value = await fn();
    logPass(label);
    return value;
  } catch (error) {
    logFail(label, error);
    throw error;
  }
}

async function main() {
  requireEnv("E2E_DASHBOARD_ID", config.dashboardId);
  requireEnv("E2E_AUTH_COOKIE", config.authCookie);

  console.log(`Testing share links against ${config.baseUrl}`);
  console.log(`Dashboard: ${config.dashboardId}`);
  console.log("Auth cookie: [REDACTED]");

  await runStep("owner can list active share links", async () => {
    await listShares();
  });

  const normalLink = await runStep("owner can generate a copyable public link", async () => {
    return createShare({ type: "link" }, "Create normal link");
  });
  const normalToken = tokenFromShareUrl(normalLink.url);

  await runStep("public dashboard API loads without auth and exposes safe fields only", async () => {
    const { response, payload } = await fetchPublic(normalToken);
    assert(response.status === 200, `Public dashboard expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
    assertNoStore(response, "Public dashboard");
    assertPublicDashboard(payload, "Public dashboard");
  });

  await runStep("view count increments after successful public load", async () => {
    const shares = await listShares();
    const refreshed = shares.links.find((link) => link.id === normalLink.id);
    assert(refreshed, "Created normal link was not returned by list shares");
    assert(
      refreshed.viewCount >= normalLink.viewCount + 1,
      `Expected viewCount >= ${normalLink.viewCount + 1}, got ${refreshed.viewCount}`,
    );
  });

  const expiringLink = await runStep("owner can generate a custom-expiry public link", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const link = await createShare({ type: "link", expiresAt }, "Create expiring link");
    assert(link.expiresAt === expiresAt, `Expected expiresAt ${expiresAt}, got ${link.expiresAt}`);
    return link;
  });

  const passwordLink = await runStep("owner can generate a password-protected public link", async () => {
    const link = await createShare({ type: "link", password: PASSWORD }, "Create password link");
    assert(link.passwordProtected === true, "Password link must report passwordProtected: true");
    return link;
  });
  const passwordToken = tokenFromShareUrl(passwordLink.url);

  await runStep("password-protected public link requires password", async () => {
    const { response, payload } = await fetchPublic(passwordToken);
    assert(response.status === 401, `Expected 401 for locked link, got ${response.status}: ${JSON.stringify(payload)}`);
    assertNoStore(response, "Locked public dashboard");
    const error = expectApiError(payload, "SHARE_PASSWORD_REQUIRED", "Locked public dashboard");
    assert(error.requiresPassword === true, "Password-required error must include requiresPassword: true");
  });

  await runStep("wrong password is rejected", async () => {
    const { response, payload } = await unlockPublic(passwordToken, WRONG_PASSWORD);
    assert(response.status === 401, `Expected 401 for wrong password, got ${response.status}: ${JSON.stringify(payload)}`);
    assertNoStore(response, "Wrong password unlock");
    expectApiError(payload, "SHARE_PASSWORD_INVALID", "Wrong password unlock");
  });

  await runStep("correct password unlocks and allows public dashboard fetch", async () => {
    const unlock = await unlockPublic(passwordToken, PASSWORD);
    assert(unlock.response.status === 200, `Expected 200 for correct password, got ${unlock.response.status}: ${JSON.stringify(unlock.payload)}`);
    assertNoStore(unlock.response, "Correct password unlock");
    const cookie = unlock.response.headers.get("set-cookie");
    assert(cookie, "Correct password unlock did not return a set-cookie header");
    const publicResult = await fetchPublic(passwordToken, cookie);
    assert(publicResult.response.status === 200, `Unlocked public dashboard expected 200, got ${publicResult.response.status}: ${JSON.stringify(publicResult.payload)}`);
    assertNoStore(publicResult.response, "Unlocked public dashboard");
    assertPublicDashboard(publicResult.payload, "Unlocked public dashboard");
  });

  await runStep("revoked link is inaccessible immediately", async () => {
    await revokeShare(normalLink, "Normal link");
    const { response, payload } = await fetchPublic(normalToken);
    assert(response.status === 404, `Expected 404 for revoked link, got ${response.status}: ${JSON.stringify(payload)}`);
    assertNoStore(response, "Revoked public dashboard");
    expectApiError(payload, "SHARE_REVOKED_OR_NOT_FOUND", "Revoked public dashboard");
  });

  await runStep("cleanup expiring link", async () => {
    await revokeShare(expiringLink, "Expiring link");
  });

  await runStep("cleanup password link", async () => {
    await revokeShare(passwordLink, "Password link");
  });

  console.log("");
  console.log(`E2E complete: ${results.length} checks passed.`);
}

main()
  .catch(async (error) => {
    await cleanup();
    console.error("");
    console.error("E2E failed.");
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });

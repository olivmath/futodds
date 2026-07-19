import assert from "node:assert/strict";
import test from "node:test";
import { createTxlineClient } from "../src/txlineClient.js";

test("TxLINE client fetches odds snapshots with activated credentials", async () => {
  const calls = [];
  const client = createTxlineClient({
    apiOrigin: "https://txline-dev.txodds.com",
    guestJwt: "jwt_1",
    apiToken: "api_1",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(200, [{ FixtureId: 17588229 }]);
    },
  });

  const odds = await client.fetchOddsSnapshot("17588229");

  assert.deepEqual(odds, [{ FixtureId: 17588229 }]);
  assert.equal(calls[0].url, "https://txline-dev.txodds.com/api/odds/snapshot/17588229");
  assert.equal(calls[0].options.headers.Authorization, "Bearer jwt_1");
  assert.equal(calls[0].options.headers["X-Api-Token"], "api_1");
});

test("TxLINE client renews the guest JWT once after a 401 response", async () => {
  const calls = [];
  const client = createTxlineClient({
    apiOrigin: "https://txline-dev.txodds.com",
    guestJwt: "expired_jwt",
    apiToken: "api_1",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/api/odds/snapshot/17588229") && calls.length === 1) {
        return textResponse(401, "expired");
      }
      if (url.endsWith("/auth/guest/start")) {
        return jsonResponse(200, { token: "fresh_jwt" });
      }
      return jsonResponse(200, [{ FixtureId: 17588229 }]);
    },
  });

  const odds = await client.fetchOddsSnapshot("17588229");

  assert.deepEqual(odds, [{ FixtureId: 17588229 }]);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].options.headers.Authorization, "Bearer fresh_jwt");
});

test("TxLINE client surfaces non-auth HTTP errors", async () => {
  const client = createTxlineClient({
    apiOrigin: "https://txline-dev.txodds.com",
    guestJwt: "jwt_1",
    apiToken: "api_1",
    fetchImpl: async () => textResponse(403, "forbidden"),
  });

  await assert.rejects(
    () => client.fetchOddsSnapshot("17588229"),
    /TxLINE request failed: 403 forbidden/,
  );
});

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function textResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
}

import { generateKeyPairSync } from "node:crypto";

import { describe, expect, test } from "vitest";

import { buildResultBundle } from "../src/core/evaluator.js";
import { signBundle, verifyBundleSignature } from "../src/core/signing.js";
import { scenarios } from "../src/fixtures/scenarios.js";

describe("optional producer signatures", () => {
  test("verifies Ed25519 identity over the content-addressed bundle", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const privateKeyPem = privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString();
    const bundle = buildResultBundle(scenarios);
    const signature = signBundle(bundle, privateKeyPem, "fixture-key");
    expect(verifyBundleSignature(bundle, signature)).toBe(true);

    signature.signedBundleHash = "0".repeat(64);
    expect(verifyBundleSignature(bundle, signature)).toBe(false);
  });
});

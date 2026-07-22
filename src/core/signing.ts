import { createPublicKey, sign, verify } from "node:crypto";

import { canonicalJson } from "./canonical.js";
import type { ResultBundle } from "./types.js";

export interface BundleSignature {
  algorithm: "Ed25519";
  keyId: string;
  publicKeyPem: string;
  signature: string;
  signedBundleHash: string;
}

function signingPayload(bundle: ResultBundle): Buffer {
  return Buffer.from(
    canonicalJson({ bundleHash: bundle.bundleHash, schema: bundle.schema }),
    "utf8",
  );
}

export function signBundle(
  bundle: ResultBundle,
  privateKeyPem: string,
  keyId: string,
): BundleSignature {
  const publicKeyPem = createPublicKey(privateKeyPem)
    .export({ format: "pem", type: "spki" })
    .toString();
  const signature = sign(null, signingPayload(bundle), privateKeyPem).toString(
    "base64",
  );
  return {
    algorithm: "Ed25519",
    keyId,
    publicKeyPem,
    signature,
    signedBundleHash: bundle.bundleHash,
  };
}

export function verifyBundleSignature(
  bundle: ResultBundle,
  envelope: BundleSignature,
): boolean {
  if (
    envelope.algorithm !== "Ed25519" ||
    envelope.signedBundleHash !== bundle.bundleHash ||
    envelope.signature.length === 0
  ) {
    return false;
  }
  return verify(
    null,
    signingPayload(bundle),
    envelope.publicKeyPem,
    Buffer.from(envelope.signature, "base64"),
  );
}

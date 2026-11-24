const encoder = new TextEncoder();

export function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new TypeError("Invalid base64url value");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

async function hmac(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, toArrayBuffer(data)));
}

async function hkdfExtract(salt: Uint8Array, input: Uint8Array): Promise<Uint8Array> {
  return hmac(salt.length ? salt : new Uint8Array(32), input);
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const blocks: Uint8Array[] = [];
  let previous = new Uint8Array();
  for (let counter = 1; blocks.reduce((sum, item) => sum + item.length, 0) < length; counter++) {
    previous = await hmac(prk, concatBytes(previous, info, new Uint8Array([counter])));
    blocks.push(previous);
  }
  return concatBytes(...blocks).slice(0, length);
}

export async function createVapidAuthorization(
  endpoint: string,
  publicKey: string,
  privateKeyPkcs8: string,
  subject: string,
): Promise<string> {
  const target = new URL(endpoint);
  if (target.protocol !== "https:" || target.username || target.password || target.port || target.hash ||
      (!["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(target.hostname) &&
      !target.hostname.endsWith(".notify.windows.com"))) throw new TypeError("Untrusted push endpoint");
  const publicBytes = decodeBase64Url(publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) throw new TypeError("Invalid VAPID public key");
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) throw new TypeError("Invalid VAPID subject");
  const header = encodeBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = encodeBase64Url(encoder.encode(JSON.stringify({
    aud: target.origin, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: subject,
  })));
  const signingInput = encoder.encode(`${header}.${payload}`);
  const key = await crypto.subtle.importKey(
    "pkcs8", toArrayBuffer(decodeBase64Url(privateKeyPkcs8)),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, toArrayBuffer(signingInput)));
  const verifyKey = await crypto.subtle.importKey("raw", toArrayBuffer(publicBytes), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const matches = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifyKey, toArrayBuffer(signature), toArrayBuffer(signingInput));
  if (!matches) throw new TypeError("VAPID key pair does not match");
  return `vapid t=${header}.${payload}.${encodeBase64Url(signature)}, k=${publicKey}`;
}

export async function encryptWebPushPayload(
  payload: string,
  clientPublicKeyBase64Url: string,
  authSecretBase64Url: string,
): Promise<Uint8Array> {
  const clientPublic = decodeBase64Url(clientPublicKeyBase64Url);
  const authSecret = decodeBase64Url(authSecretBase64Url);
  if (clientPublic.length !== 65 || clientPublic[0] !== 4 || authSecret.length !== 16) {
    throw new TypeError("Invalid Web Push subscription keys");
  }
  const plaintext = encoder.encode(payload);
  if (plaintext.length > 2048) throw new TypeError("Push payload exceeds 2 KB");

  const clientKey = await crypto.subtle.importKey(
    "raw", toArrayBuffer(clientPublic), { name: "ECDH", namedCurve: "P-256" }, false, [],
  );
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  );
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientKey }, ephemeral.privateKey, 256,
  ));
  const serverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const authPrk = await hkdfExtract(authSecret, sharedSecret);
  const info = concatBytes(encoder.encode("WebPush: info\0"), clientPublic, serverPublic);
  const inputKeyMaterial = await hkdfExpand(authPrk, info, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentPrk = await hkdfExtract(salt, inputKeyMaterial);
  const contentKey = await hkdfExpand(contentPrk, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(contentPrk, encoder.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", toArrayBuffer(contentKey), { name: "AES-GCM" }, false, ["encrypt"]);
  const padded = concatBytes(plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce), tagLength: 128 }, aesKey, toArrayBuffer(padded),
  ));
  const recordSize = new Uint8Array([0, 0, 16, 0]);
  const keyLength = new Uint8Array([serverPublic.length]);
  return concatBytes(salt, recordSize, keyLength, serverPublic, ciphertext);
}

export function base64UrlBytes(value: Uint8Array): string {
  return encodeBase64Url(value);
}

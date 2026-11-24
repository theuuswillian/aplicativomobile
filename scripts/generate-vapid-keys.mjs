import { generateKeyPairSync } from "node:crypto";

const subject = process.env.PUSH_VAPID_SUBJECT?.trim();
if (!subject || !/^(mailto:[^\\s@]+@[^\\s@]+|https:\\/\\/[^\\s]+)$/.test(subject)) {
  throw new Error("Defina PUSH_VAPID_SUBJECT como mailto:email válido ou URL HTTPS antes de gerar as chaves.");
}

const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { format: "jwk" },
  privateKeyEncoding: { type: "pkcs8", format: "der" },
});
if (!("x" in publicKey) || !("y" in publicKey)) throw new Error("Não foi possível exportar a chave pública P-256.");
const publicRaw = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(publicKey.x, "base64url"),
  Buffer.from(publicKey.y, "base64url"),
]);
console.log("PUSH_VAPID_PUBLIC_KEY=" + publicRaw.toString("base64url"));
console.log("PUSH_VAPID_PRIVATE_KEY=" + privateKey.toString("base64url"));
console.log("PUSH_VAPID_SUBJECT=" + subject);
console.log("VITE_PUSH_VAPID_PUBLIC_KEY=" + publicRaw.toString("base64url"));

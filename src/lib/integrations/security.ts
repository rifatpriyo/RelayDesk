import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export class IntegrationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}
export const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
export const nonce = () => randomBytes(32).toString("base64url");
export function equalSecret(a: string, b: string): boolean {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function verifyMetaSignature(
  raw: Uint8Array,
  signature: string | null,
  secret: string,
): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return false;
  return equalSecret(
    signature.slice(7),
    createHmac("sha256", secret).update(raw).digest("hex"),
  );
}
function key(): Buffer {
  const result = Buffer.from(
    process.env.CREDENTIAL_ENCRYPTION_KEY || "",
    "base64",
  );
  if (result.length !== 32)
    throw new IntegrationError(
      "configuration_required",
      "The operator must configure a 32-byte credential encryption key.",
      503,
    );
  return result;
}
/** AES-GCM binds ciphertext to tenant AND credential identifier; swapping rows fails authentication. */
export function encryptCredential(
  value: unknown,
  businessId: string,
  credentialId: string,
): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`${businessId}:${credentialId}:v1`));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptCredential<T>(
  value: string,
  businessId: string,
  credentialId: string,
): T {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new IntegrationError(
      "credential_invalid",
      "Reconnect this integration.",
      409,
    );
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(`${businessId}:${credentialId}:v1`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}
export function isPublicIp(value: string): boolean {
  try {
    let address = ipaddr.parse(value);
    if (
      address.kind() === "ipv6" &&
      (address as ipaddr.IPv6).isIPv4MappedAddress()
    )
      address = (address as ipaddr.IPv6).toIPv4Address();
    return address.range() === "unicast";
  } catch {
    return false;
  }
}
/** Pin the validated address at socket creation, preserving TLS servername. No second DNS lookup. */
export async function publicDatabaseAddress(host: string): Promise<string> {
  if (!/^[a-zA-Z0-9.:-]+$/.test(host) || host.length > 253)
    throw new IntegrationError(
      "unsafe_host",
      "Enter a public database hostname.",
    );
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicIp(address))
  )
    throw new IntegrationError(
      "private_network_unsupported",
      "Private, local, metadata and mixed-address database hosts are unsupported. Use a restricted public TLS endpoint.",
    );
  return addresses[0].address;
}
export function safeIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value))
    throw new IntegrationError(
      "invalid_identifier",
      "Table, schema and column names must use letters, numbers and underscores.",
    );
  return value;
}
export function safeOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntegrationError(
      "invalid_origin",
      "Enter a complete website origin.",
    );
  }
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new IntegrationError(
      "invalid_origin",
      "Website origins must use HTTPS.",
    );
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new IntegrationError(
      "invalid_origin",
      "Use an origin without a path, credentials or query.",
    );
  return url.origin;
}
export async function boundedJson(
  response: Response,
  maxBytes = 1_000_000,
): Promise<Record<string, any>> {
  if (Number(response.headers.get("content-length")) > maxBytes)
    throw new IntegrationError(
      "response_too_large",
      "The provider response exceeded the allowed size.",
      502,
    );
  const reader = response.body?.getReader();
  if (!reader)
    throw new IntegrationError(
      "provider_empty",
      "The provider returned an empty response.",
      502,
    );
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new IntegrationError(
        "response_too_large",
        "The provider response exceeded the allowed size.",
        502,
      );
    }
    parts.push(result.value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new IntegrationError(
      "provider_format",
      "The provider returned an invalid response.",
      502,
    );
  }
}
export function redactHistory(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+?88)?01[3-9][\d -]{8,12}/g, "[phone removed]")
    .replace(
      /\b(?:order|invoice|tracking|address|ঠিকানা)\s*[:#-]?[^\n]{0,120}/gi,
      "[personal reference removed]",
    );
}
export function spreadsheetSafe(value: string): string {
  return /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
}

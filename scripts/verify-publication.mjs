import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Inspect the actual Git index. Never print credential values or matched text.
const cwd = process.cwd();
const git = (...args) =>
  execFileSync(
    "git",
    ["-c", `safe.directory=${cwd.replaceAll("\\", "/")}`, ...args],
    { cwd, maxBuffer: 32 * 1024 * 1024 },
  );
const files = git("ls-files", "--cached", "-z")
  .toString("utf8")
  .split("\0")
  .filter(Boolean);
if (!files.length)
  throw new Error(
    "Stage the intended publication files before running this check.",
  );
const privateValues = [];
for (const name of readdirSync(cwd).filter(
  (name) => /^\.env(?:\.|$)/.test(name) && name !== ".env.example",
)) {
  for (const line of readFileSync(path.join(cwd, name), "utf8").split(
    /\r?\n/,
  )) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (
      !match ||
      !/(SECRET|TOKEN|PASSWORD|API_KEY|SERVICE_ROLE|ENCRYPTION_KEY|ANON_KEY|SUPABASE_URL)/.test(
        match[1],
      )
    )
      continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    if (
      value.length >= 8 &&
      !/^(replace-|your-|example|changeme|placeholder)/i.test(value)
    )
      privateValues.push(value);
  }
}
const sensitivePath =
  /(?:^|\/)(?:\.env(?:\.|$)|\.relaydesk(?:\/|$)|\.data(?:\/|$)|\.next(?:\/|$)|node_modules(?:\/|$)|test-results(?:\/|$)|playwright-report(?:\/|$)|\.aws(?:\/|$)|\.ssh(?:\/|$)|\.codex(?:\/|$)|\.agents(?:\/|$)|\.secrets(?:\/|$)|\.npmrc$|\.pypirc$|\.netrc$|backups(?:\/|$)|exports(?:\/|$))|\.(?:pem|key|p12|pfx|log|dump|bak)$/i;
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  [
    "GitHub credential",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/,
  ],
  ["provider secret key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  [
    "JWT credential",
    /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  ],
];
const findings = [];
let bytes = 0;
for (const file of files) {
  if (file !== ".env.example" && sensitivePath.test(file))
    findings.push(`${file}: private/generated path`);
  const content = git("show", `:${file}`);
  bytes += content.length;
  if (content.length > 10 * 1024 * 1024)
    findings.push(`${file}: unexpectedly large publication file`);
  const text = content.toString("utf8");
  if (privateValues.some((value) => text.includes(value)))
    findings.push(`${file}: matches a private environment value`);
  for (const [kind, pattern] of patterns)
    if (pattern.test(text)) findings.push(`${file}: ${kind} pattern`);
}
if (findings.length) {
  for (const finding of findings) console.error(finding);
  process.exitCode = 1;
} else {
  console.log(
    `Publication check passed: ${files.length} staged files, ${(bytes / 1024 / 1024).toFixed(2)} MiB; private paths, secret patterns, and exact private environment values checked. No secret values printed.`,
  );
}
const readme = git("show", ":README.md").toString("utf8");
for (const match of readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
  const target = match[1].split("#")[0];
  if (!target || /^[a-z]+:/i.test(target)) continue;
  if (!files.includes(decodeURIComponent(target))) {
    console.error(`README.md: local link target is not staged: ${target}`);
    process.exitCode = 1;
  }
}

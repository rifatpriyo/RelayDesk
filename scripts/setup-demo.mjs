import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env.local")) {
  console.log(".env.local already exists; left unchanged.");
  process.exit(0);
}
let env = readFileSync(".env.example", "utf8");
env = env
  .replace(
    "DEMO_SESSION_SECRET=replace-with-at-least-32-random-characters",
    `DEMO_SESSION_SECRET=${randomBytes(32).toString("hex")}`,
  )
  .replace(
    "CREDENTIAL_ENCRYPTION_KEY=\n",
    `CREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}\n`,
  )
  .replace(
    "CRON_SECRET=\n",
    `CRON_SECRET=${randomBytes(32).toString("hex")}\n`,
  );
writeFileSync(".env.local", env, { flag: "wx", mode: 0o600 });
console.log(
  "Created ignored .env.local for explicit local demo mode. No provider credentials are required.",
);

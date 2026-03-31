import process from "process";
import path from "path";
import { pathToFileURL } from "url";

const password = process.argv[2];

if (!password) {
  console.error("Usage: node plugins/ot-dashboard/scripts/hash-password.mjs <password>");
  process.exit(1);
}

const modulePath = pathToFileURL(path.resolve(process.cwd(), "dist/plugins/ot-dashboard/server/auth.js")).href;
const { hashPassword } = await import(modulePath);
const hash = await hashPassword(password);

process.stdout.write(`${hash}\n`);

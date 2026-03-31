import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const pluginRoot = path.resolve(import.meta.dirname, "..")
const projectRoot = path.resolve(pluginRoot, "..", "..")
const pluginsRoot = path.join(projectRoot, "plugins")
const versionHints = new Map([
  ["compression", "^1.8.1"],
  ["discord-alt-detector", "^1.0.4"],
  ["ejs", "^5.0.1"],
  ["express", "^5.2.1"],
  ["express-session", "^1.19.0"],
  ["helmet", "^8.1.0"],
  ["serve-favicon", "^2.5.1"],
  ["sqlite3", "^6.0.1"]
])

function readPluginManifestDependencies(root) {
  if (!fs.existsSync(root)) {
    return []
  }

  const found = new Set()
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const manifestPath = path.join(root, entry.name, "plugin.json")
    if (!fs.existsSync(manifestPath)) {
      continue
    }
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
      for (const raw of Array.isArray(manifest.npmDependencies) ? manifest.npmDependencies : []) {
        const normalized = String(raw || "").trim()
        if (normalized) {
          found.add(normalized)
        }
      }
    } catch {
      // Ignore malformed manifests here; Open Ticket validates them during build.
    }
  }

  return [...found]
}

const runtimeDependencies = readPluginManifestDependencies(pluginsRoot)

if (runtimeDependencies.length === 0) {
  process.exit(0)
}

const rootRequire = createRequire(path.join(projectRoot, "package.json"))
const missing = []

for (const name of runtimeDependencies) {
  try {
    rootRequire.resolve(name)
  } catch {
    const version = versionHints.get(name)
    missing.push(version ? `${name}@${version}` : name)
  }
}

if (missing.length === 0) {
  console.log("[ot-dashboard] runtime host dependencies already available")
  process.exit(0)
}

const npmExecPath = String(process.env.npm_execpath || "").trim()
const installCommand = npmExecPath ? process.execPath : (process.platform === "win32" ? "npm" : "npm")
const installArgs = npmExecPath
  ? [npmExecPath, "install", "--no-save", "--package-lock=false", ...missing]
  : ["install", "--no-save", "--package-lock=false", ...missing]
const install = spawnSync(
  installCommand,
  installArgs,
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: !npmExecPath
  }
)

if (install.error) {
  console.error("[ot-dashboard] failed to spawn npm for runtime host dependencies", install.error)
  process.exit(1)
}

if (install.status !== 0) {
  process.exit(install.status ?? 1)
}

console.log(`[ot-dashboard] installed runtime host dependencies into ${projectRoot}`)

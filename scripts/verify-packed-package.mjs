import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const candidate = path.resolve(process.argv[2])
execFileSync(process.execPath, ["scripts/candidate.mjs", "verify", candidate], { stdio: "inherit" })
const manifest = JSON.parse(fs.readFileSync(path.join(candidate, "candidate.json"), "utf8"))
const root = process.cwd()
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), "effect-rstest-consumer-"))
const run = (command, args) => execFileSync(command, args, {
  cwd: consumer, stdio: "inherit", env: { ...process.env, CI: "true" }
})
try {
  fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify({
    name: "effect-rstest-packed-consumer", private: true, type: "module"
  }))
  run("npm", [
    "install", "--ignore-scripts", "--strict-peer-deps",
    "--registry=https://registry.npmjs.org/",
    path.join(candidate, manifest.tarball),
    "@rstest/core@0.12.6", "effect@4.0.7",
    "typescript@5.9.3", "@types/node@26.4.1"
  ])
  fs.cpSync(path.join(root, "test"), path.join(consumer, "test"), { recursive: true })
  fs.writeFileSync(path.join(consumer, "tsconfig.test.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "NodeNext", strict: true, noEmit: true,
      skipLibCheck: true, allowImportingTsExtensions: true, types: ["node"]
    },
    include: ["test"]
  }))
  fs.writeFileSync(path.join(consumer, "rstest.config.mjs"), `export default {
    root: import.meta.dirname,
    include: ["test/**/*.test.ts"],
    testEnvironment: "node",
    testTimeout: 10000,
    hookTimeout: 10000,
    source: { tsconfigPath: "./tsconfig.test.json" }
  }`)
  run("npm", ["exec", "--", "tsc", "-p", "tsconfig.test.json"])
  run("npm", ["exec", "--", "rstest", "run"])
} finally {
  fs.rmSync(consumer, { recursive: true, force: true })
}

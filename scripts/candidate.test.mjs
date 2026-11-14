import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const script = fileURLToPath(new URL("./candidate.mjs", import.meta.url))
const sourceCommit = "1".repeat(40)
function fixture(check) {
  const root = fs.mkdtempSync(path.join(process.env.OWNED_TEMP_DIR ?? os.tmpdir(), "candidate-test-"))
  try {
    const source = {
      name: "@bleedingdev/effect-rstest", version: "0.1.6",
      peerDependencies: { effect: ">=4.0.7 <5.0.0", "@rstest/core": ">=0.12.6 <0.13.0" },
      exports: { ".": "./dist/index.js" }
    }
    fs.mkdirSync(path.join(root, "package"))
    fs.mkdirSync(path.join(root, "candidate"))
    for (const filename of ["package.json", "package/package.json"]) {
      fs.writeFileSync(path.join(root, filename), JSON.stringify(source))
    }
    execFileSync("tar", ["-czf", "candidate/package.tgz", "package"], { cwd: root })
    const run = (command, commit = sourceCommit) => spawnSync(process.execPath, [
      script, command, "candidate"
    ], { cwd: root, env: { ...process.env, GITHUB_SHA: commit }, encoding: "utf8" })
    assert.equal(run("create").status, 0)
    check({ root, run })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

test("candidate accepts the exact packed bytes and source", () => fixture(({ run }) => {
  const result = run("verify")
  assert.equal(result.status, 0, result.stderr)
}))
test("candidate rejects changed tarball bytes", () => fixture(({ root, run }) => {
  fs.appendFileSync(path.join(root, "candidate/package.tgz"), "changed")
  assert.notEqual(run("verify").status, 0)
}))
test("candidate rejects a different source commit", () => fixture(({ run }) => {
  assert.notEqual(run("verify", "2".repeat(40)).status, 0)
}))

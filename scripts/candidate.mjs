import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { setTimeout } from "node:timers/promises"

const [command, directory] = process.argv.slice(2)
assert.ok(["create", "verify", "registry"].includes(command))
assert.ok(directory)
assert.match(process.env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/)
const source = JSON.parse(fs.readFileSync("package.json", "utf8"))
assert.equal(source.name, "@bleedingdev/effect-rstest")
const tarballs = fs.readdirSync(directory).filter(file => file.endsWith(".tgz"))
assert.equal(tarballs.length, 1)
const tarball = tarballs[0]
const bytes = fs.readFileSync(path.join(directory, tarball))
const packed = JSON.parse(execFileSync("tar", [
  "-xOf", path.join(directory, tarball), "package/package.json"
], { encoding: "utf8" }))
for (const key of ["name", "version", "peerDependencies", "exports"]) {
  assert.deepEqual(packed[key], source[key], key)
}
const identity = {
  name: source.name,
  version: source.version,
  sourceCommit: process.env.GITHUB_SHA,
  tarball,
  integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`
}
const manifest = path.join(directory, "candidate.json")
if (command === "create") {
  fs.writeFileSync(manifest, `${JSON.stringify(identity, null, 2)}\n`)
} else {
  assert.deepEqual(JSON.parse(fs.readFileSync(manifest, "utf8")), identity)
}
if (command === "registry") {
  let lastError
  for (let attempt = 0; attempt < 36; attempt++) {
    try {
      const response = await fetch(
        `https://registry.npmjs.org/${identity.name.replace("/", "%2f")}/${identity.version}`
      )
      assert.equal(response.status, 200)
      const metadata = await response.json()
      assert.equal(metadata.dist.integrity, identity.integrity)
      assert.equal(metadata.dist.attestations.provenance.predicateType, "https://slsa.dev/provenance/v1")
      const downloaded = Buffer.from(await (await fetch(metadata.dist.tarball)).arrayBuffer())
      assert.equal(createHash("sha512").update(downloaded).digest("base64"), identity.integrity.slice(7))
      const latest = await (await fetch(
        `https://registry.npmjs.org/${identity.name.replace("/", "%2f")}/latest`
      )).json()
      assert.equal(latest.version, identity.version)
      console.log(`Verified registry bytes, latest, and provenance availability for ${identity.name}@${identity.version}`)
      process.exit(0)
    } catch (error) {
      lastError = error
      if (attempt < 35) await setTimeout(5000)
    }
  }
  throw lastError
}
console.log(`Verified ${identity.name}@${identity.version}: ${identity.integrity}`)

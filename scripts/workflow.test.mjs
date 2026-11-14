import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const workflow = fs.readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8")
const guard = [
  "github.repository == 'BleedingDev/effect-rstest' &&",
  "github.ref == 'refs/heads/main' &&",
  "github.actor == 'BleedingDev' &&",
  "github.triggering_actor == 'BleedingDev'"
].join(" ")
function assertOwnerGuard(source, job) {
  const section = source.split(`  ${job}:\n`)[1]?.split(/\n  [a-z-]+:\n/)[0]
  assert.ok(section, job)
  const condition = section.match(/    if: >-\n((?:      .+\n)+)/)?.[1]
  assert.equal(condition?.trim().replace(/\s+/g, " "), guard, job)
}
test("qualification and the privileged publisher independently require the current owner", () => {
  assertOwnerGuard(workflow, "qualify")
  assertOwnerGuard(workflow, "publish")
})
test("a failed-job rerun cannot rely on an earlier qualification's owner guard", () => {
  const prefix = workflow.slice(0, workflow.indexOf("  publish:\n"))
  const publisher = workflow.slice(prefix.length)
  const withoutGuard = publisher.replace(/    if: >-\n(?:      .+\n)+/, "")
  assert.throws(() => assertOwnerGuard(prefix + withoutGuard, "publish"))
})

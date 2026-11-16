import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { nextReleaseVersion, parseVersion } from "../../scripts/release-version.mjs";

test("the first release uses the source version and subsequent releases increment the latest patch", () => {
    assert.equal(nextReleaseVersion("2.0.2", []), "2.0.2");
    assert.equal(nextReleaseVersion("2.0.2", ["v2.0.1", "v2.0", "unrelated"]), "2.0.2");
    assert.equal(nextReleaseVersion("2.0.2", ["v2.0.9", "v2.0.10", "v2.0.2"]), "2.0.11");
    assert.equal(nextReleaseVersion("2.1.0", ["v2.0.10"]), "2.1.0");
    assert.equal(nextReleaseVersion("2.0.2", ["v3.0.0"]), "3.0.1");
});

test("release versions must be valid in both browser manifests", () => {
    assert.deepEqual(parseVersion("2.0.2"), [2, 0, 2]);
    for (const version of ["v2.0.2", "2.0", "2.0.2-beta", "02.0.2", "0.0.0", "2.0.65536", "$(echo bad)"]) {
        assert.throws(() => parseVersion(version));
    }
    assert.throws(() => nextReleaseVersion("2.0.2", ["v2.0.65535"]));
});

// Build tests run in their own temporary checkout so parallel test files cannot
// overwrite the normal dist/ packages while those packages are being inspected.
test("release packaging stamps both manifests without modifying source files", async t => {
    const { mkdtempSync, cpSync, rmSync, realpathSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join, dirname } = await import("node:path");
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const temp = mkdtempSync(join(tmpdir(), "imageconverter-build-"));
    t.after(() => {
        assert.equal(dirname(realpathSync(temp)), realpathSync(tmpdir()));
        rmSync(temp, { recursive: true, force: true });
    });
    for (const directory of ["src", "scripts"]) cpSync(join(root, directory), join(temp, directory), { recursive: true });
    const source = readFileSync(join(temp, "src", "manifest.json"), "utf8");
    execFileSync(process.execPath, ["scripts/build.mjs", "--version", "2.0.99"], { cwd: temp });
    for (const browser of ["firefox", "chromium"]) {
        const manifest = JSON.parse(readFileSync(join(temp, "dist", browser, "manifest.json"), "utf8"));
        assert.equal(manifest.version, "2.0.99");
    }
    assert.equal(readFileSync(join(temp, "src", "manifest.json"), "utf8"), source);
    assert.throws(() => execFileSync(process.execPath, ["scripts/build.mjs", "--version", "bad"], { cwd: temp, stdio: "pipe" }));
});

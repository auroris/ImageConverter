import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function parseVersion(version) {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
        throw new Error(`Invalid extension version: ${version}`);
    }
    const parts = version.split(".").map(Number);
    if (parts.some(part => part > 65535) || parts.every(part => part === 0)) {
        throw new Error(`Extension version is outside browser limits: ${version}`);
    }
    return parts;
}

const compare = (left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2];

export function nextReleaseVersion(sourceVersion, tags) {
    const source = parseVersion(sourceVersion);
    const versions = tags.filter(tag => /^v\d+\.\d+\.\d+$/.test(tag)).map(tag => parseVersion(tag.slice(1)));
    const latest = versions.sort(compare).at(-1);
    if (!latest || compare(source, latest) > 0) return sourceVersion;
    latest[2] += 1;
    const next = latest.join(".");
    parseVersion(next);
    return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const manifest = JSON.parse(readFileSync(new URL("../src/manifest.json", import.meta.url), "utf8"));
    const tags = execFileSync("git", ["tag", "--list"], { encoding: "utf8" }).trim().split(/\r?\n/);
    const version = nextReleaseVersion(manifest.version, tags);
    console.log(version);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
}

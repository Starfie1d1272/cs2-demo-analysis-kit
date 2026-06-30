import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export function readEventPackageJson(zipPath) {
  const buf = readFileSync(zipPath);
  const limit = buf.length - 30;
  for (let i = 0; i < limit; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf-8");
    if (name !== "event-package.json") continue;
    const compSize = buf.readUInt32LE(i + 18);
    const compMethod = buf.readUInt16LE(i + 8);
    const dataStart = i + 30 + nameLen + extraLen;
    if (compSize <= 0 || dataStart + compSize > buf.length) continue;
    if (compMethod === 0) {
      return JSON.parse(buf.subarray(dataStart, dataStart + compSize).toString("utf-8"));
    }
    return JSON.parse(inflateRawSync(buf.subarray(dataStart, dataStart + compSize)).toString("utf-8"));
  }
  throw new Error("event-package.json not found in zip");
}

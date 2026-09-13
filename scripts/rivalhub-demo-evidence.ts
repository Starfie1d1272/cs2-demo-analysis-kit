import { readFile, writeFile } from "node:fs/promises";
import { loadDemoPackageFromZip } from "../packages/core/src/index.ts";
import {
  buildRivalHubDemoEvidenceV1,
  fixtureIdentity,
  fixtureTarget,
  type RivalHubEvidenceTarget,
  type RivalHubMatchedParticipant,
} from "../apps/dak-studio/src/lib/rivalhub-evidence.ts";

export {
  buildRivalHubDemoEvidenceV1,
  fixtureIdentity,
  fixtureTarget,
  type RivalHubEvidenceTarget,
  type RivalHubMatchedParticipant,
};

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("Usage: tsx scripts/rivalhub-demo-evidence.ts <demo-package.zip> <output.json>");
  const pkg = await loadDemoPackageFromZip(await readFile(input));
  const target: RivalHubEvidenceTarget = fixtureTarget();
  const identities = new Map<string, RivalHubMatchedParticipant>(pkg.players.map((player, index) => [player.steamId64, fixtureIdentity(player, index, target)]));
  await writeFile(output, `${JSON.stringify(buildRivalHubDemoEvidenceV1(pkg, target, identities), null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) void main();

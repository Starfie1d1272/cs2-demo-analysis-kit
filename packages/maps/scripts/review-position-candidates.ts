import { readFile, writeFile } from "node:fs/promises";
import { generateMapPositionCandidates, materializeReviewedPositionAsset, type MapPositionCandidate, type OpeningPositionCandidateInput, type PositionCandidateReview } from "../src/position-candidates.js";

const [command, inputPath, secondPath, thirdPath, ...flags] = process.argv.slice(2);
const flag = (name: string) => { const index = flags.indexOf(name); return index >= 0 ? flags[index + 1] : undefined; };
const readJson = async <T>(path: string) => JSON.parse(await readFile(path, "utf8")) as T;

if (command === "generate" && inputPath && secondPath) {
  const rows = await readJson<OpeningPositionCandidateInput[]>(inputPath);
  await writeFile(secondPath, `${JSON.stringify(generateMapPositionCandidates(rows), null, 2)}\n`);
} else if (command === "materialize" && inputPath && secondPath && thirdPath) {
  const mapName = flag("--map"); const side = flag("--side"); const reviewer = flag("--reviewer") ?? "unknown";
  if (!mapName || (side !== "t" && side !== "ct")) throw new Error("materialize requires --map <de_map> --side <t|ct> [--reviewer name]");
  const candidates = await readJson<MapPositionCandidate[]>(inputPath); const decisions = await readJson<PositionCandidateReview[]>(secondPath);
  const asset = materializeReviewedPositionAsset(candidates, decisions, { mapName, side, reviewedAt: new Date().toISOString(), reviewer });
  await writeFile(thirdPath, `${JSON.stringify(asset, null, 2)}\n`);
} else {
  throw new Error("usage: generate <opening-facts.json> <candidates.json> | materialize <candidates.json> <reviews.json> <asset.json> --map <de_map> --side <t|ct> [--reviewer name]");
}

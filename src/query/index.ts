// src/query/index.ts
import { loadCache, checkStaleness } from "./cache.js";
import { resolveFile } from "./resolve.js";
import { queryBlastRadius, formatBlastRadius } from "./blast-radius.js";
import { queryTestMap, formatTestMap } from "./test-map.js";
import { queryRiskProfile, formatRiskProfile } from "./risk-profile.js";

const QUERY_TYPES = ["blast_radius", "risk_profile", "test_map"] as const;

export async function runQueryCommand(args: string[]): Promise<void> {
  const jsonFlag = args.includes("--json");
  const positionalArgs = args.filter(a => !a.startsWith("--"));
  const queryType = positionalArgs[0];
  const fileArg = positionalArgs[1];

  if (!queryType || !fileArg) {
    console.error("Usage: strnd query <type> <file> [--json]");
    console.error(`Types: ${QUERY_TYPES.join(", ")}`);
    process.exit(1);
  }

  if (!QUERY_TYPES.includes(queryType as typeof QUERY_TYPES[number])) {
    console.error(`Error: Unknown query type '${queryType}'. Available: ${QUERY_TYPES.join(", ")}`);
    process.exit(1);
  }

  const cache = loadCache();
  const staleness = checkStaleness(cache);
  if (staleness) console.error(staleness);

  const nodeIds = cache.graph.nodes.map(n => n.id);
  const fileId = resolveFile(nodeIds, fileArg);

  switch (queryType) {
    case "blast_radius": {
      const result = queryBlastRadius(fileId, cache);
      console.log(formatBlastRadius(result, jsonFlag));
      break;
    }
    case "test_map": {
      const result = queryTestMap(fileId, cache);
      console.log(formatTestMap(result, jsonFlag));
      break;
    }
    case "risk_profile": {
      const result = queryRiskProfile(fileId, cache);
      console.log(formatRiskProfile(result, jsonFlag));
      break;
    }
  }
}

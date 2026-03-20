// src/query/risk-profile.ts
import type { MapraCache } from "./cache.js";
import { queryTestMap, type TestMapResult } from "./test-map.js";

export interface RiskProfileResult {
  file: string;
  risk: {
    directImporters: number;
    affectedCount: number;
    cascadeDepth: number;
    amplificationRatio: number;
    modulesAffected: number;
    affectedModules: string[];
  } | null;
  churn: {
    commits30d: number;
    linesAdded: number;
    linesRemoved: number;
    lastCommitMsg: string;
  } | null;
  coChangePartners: Array<{
    file: string;
    count: number;
    confidence: number;
    linked: boolean;
  }>;
  tests: TestMapResult;
  conventionViolations: string[];
}

export function queryRiskProfile(fileId: string, cache: MapraCache): RiskProfileResult {
  // Blast radius
  const blastResult = cache.analysis.risk.find(r => r.nodeId === fileId);
  const risk = blastResult
    ? {
        directImporters: blastResult.directImporters,
        affectedCount: blastResult.affectedCount,
        cascadeDepth: blastResult.maxDepth,
        amplificationRatio: blastResult.amplificationRatio,
        modulesAffected: blastResult.modulesAffected,
        affectedModules: blastResult.affectedModuleNames,
      }
    : null;

  // Churn
  const churnResult = cache.analysis.churn.get(fileId);
  const churn = churnResult
    ? {
        commits30d: churnResult.commits30d,
        linesAdded: churnResult.linesAdded30d,
        linesRemoved: churnResult.linesRemoved30d,
        lastCommitMsg: churnResult.lastCommitMsg,
      }
    : null;

  // Co-change partners
  const coChangePartners = cache.analysis.coChanges
    .filter(cc => cc.fileA === fileId || cc.fileB === fileId)
    .map(cc => ({
      file: cc.fileA === fileId ? cc.fileB : cc.fileA,
      count: cc.coChangeCount,
      confidence: cc.confidence,
      linked: cc.importConnected,
    }));

  // Tests (reuses test_map algorithm)
  const tests = queryTestMap(fileId, cache);

  // Convention violations
  const conventionViolations: string[] = [];
  for (const conv of cache.analysis.conventions) {
    if (conv.violators.includes(fileId)) {
      conventionViolations.push(
        `${conv.anchorFile}:${conv.anchorExports.join(",")} \u2014 ${conv.consumerType} (${Math.round(conv.coverage * 100)}% adoption)`,
      );
    }
  }

  return { file: fileId, risk, churn, coChangePartners, tests, conventionViolations };
}

export function formatRiskProfile(result: RiskProfileResult, json: boolean): string {
  if (json) return JSON.stringify(result, null, 2);

  const lines: string[] = [result.file];

  // Risk
  if (result.risk) {
    lines.push(
      `risk: \u00D7${result.risk.directImporters}\u2192${result.risk.affectedCount}  d${result.risk.cascadeDepth}  amp${result.risk.amplificationRatio}  ${result.risk.modulesAffected}mod`,
    );
  } else {
    lines.push("risk: (none)");
  }

  // Churn
  if (result.churn) {
    lines.push(
      `churn: ${result.churn.commits30d} commits/30d  +${result.churn.linesAdded} -${result.churn.linesRemoved}  last: "${result.churn.lastCommitMsg}"`,
    );
  } else {
    lines.push("churn: (none)");
  }

  // Co-change
  if (result.coChangePartners.length > 0) {
    const parts = result.coChangePartners.map(
      p => `${p.file} (${p.count}\u00D7, ${Math.round(p.confidence * 100)}% confidence${p.linked ? ", linked" : ""})`,
    );
    lines.push(`co-change: ${parts.join("; ")}`);
  } else {
    lines.push("co-change: (none)");
  }

  // Tests
  if (result.tests.testCount > 0) {
    const testParts: string[] = [];
    for (const t of result.tests.directTests) {
      testParts.push(`${t} (direct)`);
    }
    for (const t of result.tests.transitiveTests) {
      testParts.push(`${t.test} (transitive)`);
    }
    lines.push(`tests: ${testParts.join(", ")}`);
  } else {
    lines.push("tests: (none)");
  }

  // Convention violations
  if (result.conventionViolations.length > 0) {
    lines.push(`conventions: ${result.conventionViolations.join("; ")}`);
  } else {
    lines.push("conventions: no violations");
  }

  return lines.join("\n");
}

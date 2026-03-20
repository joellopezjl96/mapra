// src/query/__tests__/fixture.ts
import type { StrandGraph } from "../../scanner/index.js";
import type { GraphAnalysis } from "../../analyzer/index.js";
import type { BlastResult } from "../../analyzer/blast-radius.js";
import type { ChurnResult } from "../../analyzer/churn.js";
import type { Convention } from "../../analyzer/conventions.js";
import type { CoChangePair } from "../../analyzer/co-change.js";
import type { MapraCache } from "../cache.js";

export function createTestGraph(): StrandGraph {
  return {
    projectName: "test-project",
    projectType: "library",
    framework: "typescript",
    totalFiles: 5,
    totalLines: 500,
    nodes: [
      { id: "src/lib/utils.ts", path: "src/lib/utils.ts", type: "utility", name: "utils", lines: 100, imports: [], exports: ["formatDate", "parseId"], complexity: 0.3, domain: "shared" },
      { id: "src/services/service.ts", path: "src/services/service.ts", type: "module", name: "service", lines: 150, imports: ["src/lib/utils.ts"], exports: ["OrderService"], complexity: 0.5, domain: "orders" },
      { id: "src/controllers/controller.ts", path: "src/controllers/controller.ts", type: "module", name: "controller", lines: 120, imports: ["src/services/service.ts"], exports: ["OrderController"], complexity: 0.4, domain: "orders" },
      { id: "src/controllers/app.ts", path: "src/controllers/app.ts", type: "module", name: "app", lines: 80, imports: ["src/controllers/controller.ts"], exports: ["bootstrap"], complexity: 0.2, domain: "app" },
      { id: "src/lib/utils.test.ts", path: "src/lib/utils.test.ts", type: "test", name: "utils.test", lines: 30, imports: ["src/lib/utils.ts"], exports: [], complexity: 0.1 },
      { id: "src/controllers/controller.test.ts", path: "src/controllers/controller.test.ts", type: "test", name: "controller.test", lines: 20, imports: ["src/controllers/controller.ts"], exports: [], complexity: 0.1 },
    ],
    edges: [
      { from: "src/services/service.ts", to: "src/lib/utils.ts", type: "imports", weight: 1 },
      { from: "src/controllers/controller.ts", to: "src/services/service.ts", type: "imports", weight: 1 },
      { from: "src/controllers/app.ts", to: "src/controllers/controller.ts", type: "imports", weight: 1 },
      { from: "src/lib/utils.test.ts", to: "src/lib/utils.ts", type: "tests", weight: 1 },
      { from: "src/controllers/controller.test.ts", to: "src/controllers/controller.ts", type: "tests", weight: 1 },
    ],
    modules: [
      { id: "src/lib", name: "src/lib", path: "src/lib", nodeCount: 2, totalLines: 130, entryPoints: [] },
      { id: "src/services", name: "src/services", path: "src/services", nodeCount: 1, totalLines: 150, entryPoints: [] },
      { id: "src/controllers", name: "src/controllers", path: "src/controllers", nodeCount: 3, totalLines: 220, entryPoints: [] },
    ],
  };
}

export function createTestAnalysis(): GraphAnalysis {
  const churn = new Map<string, ChurnResult>();
  churn.set("src/lib/utils.ts", {
    nodeId: "src/lib/utils.ts",
    commits30d: 8,
    linesAdded30d: 120,
    linesRemoved30d: 45,
    lastCommitHash: "abc1234",
    lastCommitDate: "2026-03-14",
    lastCommitMsg: "feat: add menu categories",
  });

  const risk: BlastResult[] = [
    {
      nodeId: "src/lib/utils.ts",
      directImporters: 1,
      affectedCount: 3,
      weightedImpact: 1.53,
      modulesAffected: 2,
      affectedModuleNames: ["src/controllers", "src/services"],
      maxDepth: 3,
      amplificationRatio: 3.0,
    },
    {
      nodeId: "src/services/service.ts",
      directImporters: 1,
      affectedCount: 2,
      weightedImpact: 1.19,
      modulesAffected: 1,
      affectedModuleNames: ["src/controllers"],
      maxDepth: 2,
      amplificationRatio: 2.0,
    },
  ];

  const conventions: Convention[] = [
    {
      anchorFile: "src/lib/utils.ts",
      anchorExports: ["formatDate"],
      consumerType: "module",
      adoption: 2,
      total: 2,
      coverage: 1.0,
      violators: [],
    },
  ];

  const coChanges: CoChangePair[] = [
    {
      fileA: "src/lib/utils.ts",
      fileB: "src/services/service.ts",
      coChangeCount: 6,
      totalCommitsA: 8,
      totalCommitsB: 5,
      confidence: 1.0,
      importConnected: true,
    },
  ];

  return {
    risk,
    deadCode: [],
    churn,
    conventions,
    coChanges,
  };
}

export function createTestCache(overrides?: Partial<MapraCache>): MapraCache {
  return {
    version: 1,
    generated: "2026-03-15T12:00:00.000Z",
    gitHead: "abc1234def5678",
    graph: createTestGraph(),
    analysis: createTestAnalysis(),
    ...overrides,
  };
}

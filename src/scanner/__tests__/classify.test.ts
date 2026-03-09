import { describe, it, expect } from "vitest";
import { scanCodebase } from "../index.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function scaffoldAndScan(files: Record<string, string>) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "strand-classify-"));
  // Create package.json so resolveTarget doesn't warn
  fs.writeFileSync(path.join(tmp, "package.json"), '{"name":"test","dependencies":{"next":"14.0.0","react":"18.0.0"}}');
  // Create next.config.js so framework is detected as nextjs
  fs.writeFileSync(path.join(tmp, "next.config.js"), "module.exports = {};");

  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(tmp, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  const graph = scanCodebase(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  return graph;
}

describe("classifyFile — Next.js entry points", () => {
  it("classifies page.tsx as route", () => {
    const graph = scaffoldAndScan({
      "src/app/dashboard/page.tsx": "export default function Page() { return <div/>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("page.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies layout.tsx as layout", () => {
    const graph = scaffoldAndScan({
      "src/app/layout.tsx": "export default function Layout({ children }) { return <div>{children}</div>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("layout.tsx"));
    expect(node?.type).toBe("layout");
  });

  it("classifies loading.tsx as route", () => {
    const graph = scaffoldAndScan({
      "src/app/dashboard/loading.tsx": "export default function Loading() { return <div/>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("loading.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies error.tsx as route", () => {
    const graph = scaffoldAndScan({
      "src/app/settings/error.tsx": "'use client'; export default function Error() { return <div/>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("error.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies not-found.tsx as route", () => {
    const graph = scaffoldAndScan({
      "src/app/not-found.tsx": "export default function NotFound() { return <div/>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("not-found.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies template.tsx as route", () => {
    const graph = scaffoldAndScan({
      "src/app/template.tsx": "export default function Template({ children }) { return <div>{children}</div>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("template.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies default.tsx as route", () => {
    const graph = scaffoldAndScan({
      "src/app/@modal/default.tsx": "export default function Default() { return null; }",
    });
    const node = graph.nodes.find(n => n.path.includes("default.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies global-error.tsx as route", () => {
    const graph = scaffoldAndScan({
      "src/app/global-error.tsx": "'use client'; export default function GlobalError() { return <div/>; }",
    });
    const node = graph.nodes.find(n => n.path.includes("global-error.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies api route.ts as api-route", () => {
    const graph = scaffoldAndScan({
      "src/app/api/users/route.ts": "export async function GET() { return Response.json({}); }",
    });
    const node = graph.nodes.find(n => n.path.includes("route.ts"));
    expect(node?.type).toBe("api-route");
  });

  it("classifies middleware.ts as middleware", () => {
    const graph = scaffoldAndScan({
      "middleware.ts": "export function middleware(req) { return req; }",
    });
    const node = graph.nodes.find(n => n.path.includes("middleware.ts"));
    expect(node?.type).toBe("middleware");
  });
});

describe("classifyFile — test patterns", () => {
  it("classifies .test.ts as test", () => {
    const graph = scaffoldAndScan({
      "src/lib/utils.test.ts": "describe('utils', () => {});",
    });
    const node = graph.nodes.find(n => n.path.includes("utils.test.ts"));
    expect(node?.type).toBe("test");
  });

  it("classifies .spec.ts as test", () => {
    const graph = scaffoldAndScan({
      "src/lib/utils.spec.ts": "describe('utils', () => {});",
    });
    const node = graph.nodes.find(n => n.path.includes("utils.spec.ts"));
    expect(node?.type).toBe("test");
  });

  it("classifies .e2e-spec.ts as test", () => {
    const graph = scaffoldAndScan({
      "src/api/bookings.e2e-spec.ts": "describe('bookings', () => {});",
    });
    const node = graph.nodes.find(n => n.path.includes("e2e-spec"));
    expect(node?.type).toBe("test");
  });

  it("classifies .e2e.ts as test", () => {
    const graph = scaffoldAndScan({
      "src/api/bookings.e2e.ts": "describe('bookings', () => {});",
    });
    const node = graph.nodes.find(n => n.path.includes("e2e.ts"));
    expect(node?.type).toBe("test");
  });

  it("classifies files in __tests__/ as test", () => {
    const graph = scaffoldAndScan({
      "src/__tests__/helpers.ts": "export function createFixture() {}",
    });
    const node = graph.nodes.find(n => n.path.includes("helpers.ts"));
    expect(node?.type).toBe("test");
  });

  it("classifies files in playwright/ as test", () => {
    const graph = scaffoldAndScan({
      "playwright/fixtures/bookings.ts": "export function createBooking() {}",
    });
    const node = graph.nodes.find(n => n.path.includes("bookings.ts"));
    expect(node?.type).toBe("test");
  });

  it("classifies files in cypress/ as test", () => {
    const graph = scaffoldAndScan({
      "cypress/support/commands.ts": "export function login() {}",
    });
    const node = graph.nodes.find(n => n.path.includes("commands.ts"));
    expect(node?.type).toBe("test");
  });

  it("classifies files in test/ as test", () => {
    const graph = scaffoldAndScan({
      "test/helpers/setup.ts": "export function setup() {}",
    });
    const node = graph.nodes.find(n => n.path.includes("setup.ts"));
    expect(node?.type).toBe("test");
  });

  it("classifies files in tests/ as test", () => {
    const graph = scaffoldAndScan({
      "tests/integration/api.ts": "export function testApi() {}",
    });
    const node = graph.nodes.find(n => n.path.includes("api.ts"));
    expect(node?.type).toBe("test");
  });

  it("classifies files in e2e/ as test", () => {
    const graph = scaffoldAndScan({
      "e2e/booking-flow.ts": "export function bookingTest() {}",
    });
    const node = graph.nodes.find(n => n.path.includes("booking-flow.ts"));
    expect(node?.type).toBe("test");
  });

  it("classifies files in nested monorepo paths like apps/web/playwright/ as test", () => {
    const graph = scaffoldAndScan({
      "apps/web/playwright/fixtures.ts": "export function createFixture() {}",
    });
    const node = graph.nodes.find(n => n.path.includes("fixtures.ts"));
    expect(node?.type).toBe("test");
  });

  it("classifies files in nested monorepo paths like packages/bookings/tests/ as test", () => {
    const graph = scaffoldAndScan({
      "packages/bookings/tests/setup.ts": "export function setupTest() {}",
    });
    const node = graph.nodes.find(n => n.path.includes("setup.ts"));
    expect(node?.type).toBe("test");
  });

  it("does not classify files with 'test' in non-directory path as test", () => {
    const graph = scaffoldAndScan({
      "src/lib/contest-utils.ts": "export function getContest() { return {}; }",
    });
    const node = graph.nodes.find(n => n.path.includes("contest-utils.ts"));
    expect(node?.type).toBe("utility");
  });
});

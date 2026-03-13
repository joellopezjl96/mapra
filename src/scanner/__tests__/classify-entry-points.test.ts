import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { scanCodebase } from "../index.js";

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "strand-ep-"));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, ...relPath.split("/"));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe("classifyFile — framework-agnostic entry points", () => {
  const tmps: string[] = [];
  function tmp(): string {
    const d = makeTmp();
    tmps.push(d);
    return d;
  }
  afterEach(() => {
    for (const t of tmps) fs.rmSync(t, { recursive: true, force: true });
    tmps.length = 0;
  });

  it("classifies page.tsx as route WITHOUT Next.js detected", () => {
    const root = tmp();
    // No "next" in package.json — framework detection returns typescript
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "app/dashboard/page.tsx", "export default function Page() { return <div/>; }");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("page.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies layout.tsx as layout WITHOUT Next.js detected", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "app/layout.tsx", "export default function Layout({ children }) { return <html>{children}</html>; }");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("layout.tsx"));
    expect(node?.type).toBe("layout");
  });

  it("classifies loading.tsx as route (Next.js special page)", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "app/loading.tsx", "export default function Loading() { return <div/>; }");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("loading.tsx"));
    expect(node?.type).toBe("route");
  });

  it("classifies api/route.ts as api-route WITHOUT Next.js detected", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "app/api/users/route.ts", "export async function GET() { return Response.json({}); }");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("route.ts"));
    expect(node?.type).toBe("api-route");
  });

  it("classifies *.controller.ts as route", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "src/bookings/bookings.controller.ts", "export class BookingsController {}");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("controller.ts"));
    expect(node?.type).toBe("route");
  });

  it("classifies *.module.ts as config", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "src/app.module.ts", "export class AppModule {}");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("module.ts"));
    expect(node?.type).toBe("config");
  });

  it("classifies *.guard.ts as middleware", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "src/auth/auth.guard.ts", "export class AuthGuard {}");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("guard.ts"));
    expect(node?.type).toBe("middleware");
  });

  it("classifies *.service.ts as utility (not route)", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "src/bookings/bookings.service.ts", "export class BookingsService {}");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("service.ts"));
    expect(node?.type).toBe("utility");
  });

  it("classifies *.interceptor.ts as middleware", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "src/logging.interceptor.ts", "export class LoggingInterceptor {}");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("interceptor.ts"));
    expect(node?.type).toBe("middleware");
  });

  it("classifies *.pipe.ts as middleware", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "src/validation.pipe.ts", "export class ValidationPipe {}");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("pipe.ts"));
    expect(node?.type).toBe("middleware");
  });

  it("classifies *.filter.ts as middleware", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "src/http-exception.filter.ts", "export class HttpExceptionFilter {}");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("filter.ts"));
    expect(node?.type).toBe("middleware");
  });

  it("still classifies regular utility files as utility", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({ name: "test" }));
    writeFile(root, "src/utils/helpers.ts", "export function add(a: number, b: number) { return a + b; }");

    const graph = scanCodebase(root);
    const node = graph.nodes.find(n => n.id.includes("helpers.ts"));
    expect(node?.type).toBe("utility");
  });

  it("detects NestJS framework from @nestjs/core dependency", () => {
    const root = tmp();
    writeFile(root, "package.json", JSON.stringify({
      name: "test",
      dependencies: { "@nestjs/core": "^10.0.0", "express": "^4.0.0" },
    }));
    writeFile(root, "src/main.ts", "export class Main {}");

    const graph = scanCodebase(root);
    expect(graph.framework).toBe("nestjs");
  });
});

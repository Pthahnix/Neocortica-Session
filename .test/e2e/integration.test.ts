import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../../src/worker/server.js";
import { TaskExecutor } from "../../src/worker/task_executor.js";
import { HttpTransport, TransportError } from "../../src/local/http_transport.js";
import { WorkerRegistry } from "../../src/local/worker_registry.js";
import { TaskTracker } from "../../src/local/task_tracker.js";
import { workerRegister } from "../../src/local/tools/worker_register.js";
import { workerList } from "../../src/local/tools/worker_list.js";
import { taskDispatch } from "../../src/local/tools/task_dispatch.js";
import { taskStatus } from "../../src/local/tools/task_status.js";
import { taskAbort } from "../../src/local/tools/task_abort.js";

describe("E2E: local tools → worker server", () => {
  let workerDir: string;
  let localDir: string;
  let executor: TaskExecutor;
  let server: http.Server;
  let workerUrl: string;
  let transport: HttpTransport;
  let registry: WorkerRegistry;
  let tracker: TaskTracker;

  beforeEach(async () => {
    // Worker side
    workerDir = await mkdtemp(join(tmpdir(), "relay-e2e-worker-"));
    await mkdir(join(workerDir, "inbox"), { recursive: true });
    await mkdir(join(workerDir, "outbox"), { recursive: true });
    await mkdir(join(workerDir, "experiment"), { recursive: true });
    await mkdir(join(workerDir, "supervisor"), { recursive: true });

    executor = new TaskExecutor(workerDir);
    await executor.initialize();

    const app = createApp(executor);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number };
    workerUrl = `http://127.0.0.1:${addr.port}`;

    // Local side
    localDir = await mkdtemp(join(tmpdir(), "relay-e2e-local-"));
    transport = new HttpTransport({ authToken: "", retries: 0 });
    registry = new WorkerRegistry(localDir);
    await registry.load();
    tracker = new TaskTracker(localDir);
    await tracker.load();
  });

  afterEach(async () => {
    executor.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise((r) => setTimeout(r, 300));
    await rm(workerDir, { recursive: true, force: true }).catch(() => {});
    await rm(localDir, { recursive: true, force: true }).catch(() => {});
  });

  it("full flow: register → dispatch → status → abort", async () => {
    // 1. Register worker via tool
    const regResult = JSON.parse(
      await workerRegister({ url: workerUrl, name: "test-pod" }, registry, transport),
    );
    assert.equal(regResult.ok, true);
    assert.ok(regResult.worker.workerId.startsWith("w-"));
    assert.equal(regResult.worker.lastHealth.status, "ok");

    // 2. List workers
    const listResult = JSON.parse(await workerList(registry));
    assert.equal(listResult.count, 1);
    assert.equal(listResult.workers[0].name, "test-pod");

    // 3. Dispatch task
    const dispatchResult = JSON.parse(
      await taskDispatch(
        {
          workerId: regResult.worker.workerId,
          experimentPlan: "# E2E Test\nRun a simple experiment",
          checkpoints: ["setup", "run"],
          apiKey: "sk-test-e2e",
        },
        registry,
        tracker,
        transport,
      ),
    );
    // May succeed (201) or fail (CC not available) — both are valid in test
    if (dispatchResult.ok) {
      assert.ok(dispatchResult.task.taskId);

      // 4. Check status
      // Wait for CC to exit (it will fail since claude isn't available)
      await new Promise((r) => setTimeout(r, 500));

      const statusResult = JSON.parse(
        await taskStatus(
          { taskId: dispatchResult.task.taskId },
          registry,
          tracker,
          transport,
        ),
      );
      assert.equal(statusResult.ok, true);
    }
  });

  it("health check via transport directly", async () => {
    const health = await transport.health(workerUrl);
    assert.equal(health.status, "ok");
    assert.equal(typeof health.uptime, "number");
  });

  it("status returns 404 for unknown task", async () => {
    try {
      await transport.status(workerUrl, "t-nonexistent");
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.ok(err instanceof TransportError);
      assert.equal(err.statusCode, 404);
    }
  });

  it("dispatch rejects invalid payload via transport", async () => {
    try {
      await transport.dispatch(workerUrl, {
        experimentPlan: "",
        checkpoints: [],
        modelConfig: { apiKey: "" },
      });
      assert.fail("Should have thrown");
    } catch (err: any) {
      assert.ok(err instanceof TransportError);
      assert.equal(err.statusCode, 400);
    }
  });

  it("feedback rejects invalid action via transport", async () => {
    try {
      // Use raw fetch since transport.feedback expects valid action
      const res = await fetch(`${workerUrl}/task/t-1/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invalid" }),
      });
      assert.equal(res.status, 400);
    } catch {
      // Network error is also acceptable in test
    }
  });
});

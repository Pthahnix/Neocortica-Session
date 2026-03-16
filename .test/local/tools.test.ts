import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkerRegistry } from "../../src/local/worker_registry.js";
import { TaskTracker } from "../../src/local/task_tracker.js";
import type { ITransport } from "../../src/local/http_transport.js";
import type { TaskPayload, TaskInfo, Report, Feedback, HealthInfo } from "../../src/shared/types.js";
import { workerRegister } from "../../src/local/tools/worker_register.js";
import { workerUnregister } from "../../src/local/tools/worker_unregister.js";
import { workerList } from "../../src/local/tools/worker_list.js";
import { taskDispatch } from "../../src/local/tools/task_dispatch.js";
import { taskStatus } from "../../src/local/tools/task_status.js";
import { taskReport } from "../../src/local/tools/task_report.js";
import { taskFeedback } from "../../src/local/tools/task_feedback.js";
import { taskFiles } from "../../src/local/tools/task_files.js";
import { taskAbort } from "../../src/local/tools/task_abort.js";

/** Mock transport that returns configurable responses. */
function createMockTransport(overrides: Partial<ITransport> = {}): ITransport {
  return {
    health: async () => ({ status: "ok", uptime: 100 }),
    dispatch: async (_url: string, _payload: TaskPayload) => ({
      taskId: "t-mock-1",
      status: "running" as const,
      phase: "setup",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    status: async () => ({
      taskId: "t-mock-1",
      status: "running" as const,
      phase: "training",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    report: async () => ({
      phase: "training",
      summary: "Epoch 5 done",
      details: "# Report",
      files: ["model.pt"],
    }),
    feedback: async () => {},
    files: async () => ({ path: "model.pt", encoding: "utf-8", content: "data" }),
    abort: async () => {},
    ...overrides,
  };
}

describe("local/tools", () => {
  let tmpDir: string;
  let registry: WorkerRegistry;
  let tracker: TaskTracker;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "relay-tools-test-"));
    registry = new WorkerRegistry(tmpDir);
    await registry.load();
    tracker = new TaskTracker(tmpDir);
    await tracker.load();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("worker_register", () => {
    it("registers a worker after health check", async () => {
      const transport = createMockTransport();
      const result = JSON.parse(await workerRegister(
        { url: "http://localhost:8080", name: "gpu-1" },
        registry, transport,
      ));
      assert.equal(result.ok, true);
      assert.ok(result.worker.workerId.startsWith("w-"));
      assert.equal(registry.size, 1);
    });

    it("fails on health check failure", async () => {
      const transport = createMockTransport({
        health: async () => { throw new Error("Connection refused"); },
      });
      const result = JSON.parse(await workerRegister(
        { url: "http://localhost:9999" },
        registry, transport,
      ));
      assert.equal(result.ok, false);
      assert.ok(result.error.includes("Health check failed"));
    });

    it("fails on duplicate URL", async () => {
      const transport = createMockTransport();
      await workerRegister({ url: "http://localhost:8080" }, registry, transport);
      const result = JSON.parse(await workerRegister(
        { url: "http://localhost:8080" },
        registry, transport,
      ));
      assert.equal(result.ok, false);
      assert.ok(result.error.includes("already registered"));
    });
  });

  describe("worker_unregister", () => {
    it("unregisters a worker", async () => {
      const transport = createMockTransport();
      const reg = JSON.parse(await workerRegister(
        { url: "http://localhost:8080" },
        registry, transport,
      ));
      const result = JSON.parse(await workerUnregister(
        { workerId: reg.worker.workerId },
        registry,
      ));
      assert.equal(result.ok, true);
      assert.equal(registry.size, 0);
    });

    it("fails for unknown worker", async () => {
      const result = JSON.parse(await workerUnregister(
        { workerId: "w-nonexistent" },
        registry,
      ));
      assert.equal(result.ok, false);
    });
  });

  describe("worker_list", () => {
    it("lists registered workers", async () => {
      const transport = createMockTransport();
      await workerRegister({ url: "http://localhost:8080", name: "w1" }, registry, transport);
      await workerRegister({ url: "http://localhost:8081", name: "w2" }, registry, transport);

      const result = JSON.parse(await workerList(registry));
      assert.equal(result.count, 2);
      assert.equal(result.workers.length, 2);
    });

    it("returns empty list when no workers", async () => {
      const result = JSON.parse(await workerList(registry));
      assert.equal(result.count, 0);
    });
  });

  describe("task_dispatch", () => {
    it("dispatches task to worker", async () => {
      const transport = createMockTransport();
      const reg = JSON.parse(await workerRegister(
        { url: "http://localhost:8080" },
        registry, transport,
      ));

      const result = JSON.parse(await taskDispatch({
        workerId: reg.worker.workerId,
        experimentPlan: "# Test\nDo something",
        checkpoints: ["step1"],
        apiKey: "sk-test",
      }, registry, tracker, transport));

      assert.equal(result.ok, true);
      assert.equal(result.task.taskId, "t-mock-1");
      assert.equal(result.task.workerId, reg.worker.workerId);
    });

    it("rejects dispatch to unknown worker", async () => {
      const transport = createMockTransport();
      const result = JSON.parse(await taskDispatch({
        workerId: "w-nonexistent",
        experimentPlan: "# Test",
        checkpoints: ["step1"],
        apiKey: "sk-test",
      }, registry, tracker, transport));
      assert.equal(result.ok, false);
      assert.ok(result.error.includes("Worker not found"));
    });

    it("rejects dispatch when worker busy", async () => {
      const transport = createMockTransport();
      const reg = JSON.parse(await workerRegister(
        { url: "http://localhost:8080" },
        registry, transport,
      ));

      // First dispatch
      await taskDispatch({
        workerId: reg.worker.workerId,
        experimentPlan: "# Test",
        checkpoints: ["step1"],
        apiKey: "sk-test",
      }, registry, tracker, transport);

      // Second dispatch should fail
      const result = JSON.parse(await taskDispatch({
        workerId: reg.worker.workerId,
        experimentPlan: "# Test 2",
        checkpoints: ["step1"],
        apiKey: "sk-test",
      }, registry, tracker, transport));
      assert.equal(result.ok, false);
      assert.ok(result.error.includes("already has active task"));
    });
  });

  describe("task_status", () => {
    it("returns task status from worker", async () => {
      const transport = createMockTransport();
      const reg = JSON.parse(await workerRegister(
        { url: "http://localhost:8080" },
        registry, transport,
      ));
      await taskDispatch({
        workerId: reg.worker.workerId,
        experimentPlan: "# Test",
        checkpoints: ["step1"],
        apiKey: "sk-test",
      }, registry, tracker, transport);

      const result = JSON.parse(await taskStatus(
        { taskId: "t-mock-1" },
        registry, tracker, transport,
      ));
      assert.equal(result.ok, true);
      assert.equal(result.task.status, "running");
    });

    it("fails for unknown task", async () => {
      const transport = createMockTransport();
      const result = JSON.parse(await taskStatus(
        { taskId: "t-nonexistent" },
        registry, tracker, transport,
      ));
      assert.equal(result.ok, false);
    });
  });

  describe("task_report", () => {
    it("returns report from worker", async () => {
      const transport = createMockTransport();
      const reg = JSON.parse(await workerRegister(
        { url: "http://localhost:8080" },
        registry, transport,
      ));
      await taskDispatch({
        workerId: reg.worker.workerId,
        experimentPlan: "# Test",
        checkpoints: ["step1"],
        apiKey: "sk-test",
      }, registry, tracker, transport);

      const result = JSON.parse(await taskReport(
        { taskId: "t-mock-1" },
        registry, tracker, transport,
      ));
      assert.equal(result.ok, true);
      assert.equal(result.report.phase, "training");
    });
  });

  describe("task_feedback", () => {
    it("sends feedback to worker", async () => {
      const transport = createMockTransport();
      const reg = JSON.parse(await workerRegister(
        { url: "http://localhost:8080" },
        registry, transport,
      ));
      await taskDispatch({
        workerId: reg.worker.workerId,
        experimentPlan: "# Test",
        checkpoints: ["step1"],
        apiKey: "sk-test",
      }, registry, tracker, transport);

      const result = JSON.parse(await taskFeedback(
        { taskId: "t-mock-1", action: "continue", message: "LGTM" },
        registry, tracker, transport,
      ));
      assert.equal(result.ok, true);
    });

    it("updates tracker to aborted on abort action", async () => {
      const transport = createMockTransport();
      const reg = JSON.parse(await workerRegister(
        { url: "http://localhost:8080" },
        registry, transport,
      ));
      await taskDispatch({
        workerId: reg.worker.workerId,
        experimentPlan: "# Test",
        checkpoints: ["step1"],
        apiKey: "sk-test",
      }, registry, tracker, transport);

      await taskFeedback(
        { taskId: "t-mock-1", action: "abort" },
        registry, tracker, transport,
      );
      const tracked = tracker.get("t-mock-1");
      assert.equal(tracked?.status, "aborted");
    });
  });

  describe("task_files", () => {
    it("downloads file from worker", async () => {
      const transport = createMockTransport();
      const reg = JSON.parse(await workerRegister(
        { url: "http://localhost:8080" },
        registry, transport,
      ));
      await taskDispatch({
        workerId: reg.worker.workerId,
        experimentPlan: "# Test",
        checkpoints: ["step1"],
        apiKey: "sk-test",
      }, registry, tracker, transport);

      const result = JSON.parse(await taskFiles(
        { taskId: "t-mock-1", path: "model.pt" },
        registry, tracker, transport,
      ));
      assert.equal(result.ok, true);
      assert.equal(result.file.path, "model.pt");
    });
  });

  describe("task_abort", () => {
    it("aborts task on worker", async () => {
      const transport = createMockTransport();
      const reg = JSON.parse(await workerRegister(
        { url: "http://localhost:8080" },
        registry, transport,
      ));
      await taskDispatch({
        workerId: reg.worker.workerId,
        experimentPlan: "# Test",
        checkpoints: ["step1"],
        apiKey: "sk-test",
      }, registry, tracker, transport);

      const result = JSON.parse(await taskAbort(
        { taskId: "t-mock-1" },
        registry, tracker, transport,
      ));
      assert.equal(result.ok, true);
      assert.equal(tracker.get("t-mock-1")?.status, "aborted");
    });

    it("fails for unknown task", async () => {
      const transport = createMockTransport();
      const result = JSON.parse(await taskAbort(
        { taskId: "t-nonexistent" },
        registry, tracker, transport,
      ));
      assert.equal(result.ok, false);
    });
  });
});

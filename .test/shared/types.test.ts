import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_TOOLS_WHITELIST,
  TERMINAL_STATUSES,
  isValidAllowedTools,
  isBlockedEnvKey,
  validateEnvConfig,
  validateTaskPayload,
  type TaskStatus,
  type TaskPayload,
  type TaskInfo,
  type Report,
  type Feedback,
  type HealthInfo,
  type WorkerEntry,
  type PersistedState,
} from "../../src/shared/types.js";

describe("shared/types", () => {
  describe("TERMINAL_STATUSES", () => {
    it("contains completed, failed, aborted", () => {
      assert.ok(TERMINAL_STATUSES.has("completed"));
      assert.ok(TERMINAL_STATUSES.has("failed"));
      assert.ok(TERMINAL_STATUSES.has("aborted"));
    });

    it("does not contain non-terminal statuses", () => {
      assert.ok(!TERMINAL_STATUSES.has("idle"));
      assert.ok(!TERMINAL_STATUSES.has("initializing"));
      assert.ok(!TERMINAL_STATUSES.has("running"));
      assert.ok(!TERMINAL_STATUSES.has("awaiting_approval"));
    });
  });

  describe("ALLOWED_TOOLS_WHITELIST", () => {
    it("contains exactly 6 tools", () => {
      assert.equal(ALLOWED_TOOLS_WHITELIST.length, 6);
    });

    it("contains expected tools", () => {
      const expected = ["Bash", "Write", "Edit", "Read", "Glob", "Grep"];
      for (const tool of expected) {
        assert.ok(
          (ALLOWED_TOOLS_WHITELIST as readonly string[]).includes(tool),
          `Missing tool: ${tool}`,
        );
      }
    });
  });

  describe("isValidAllowedTools", () => {
    it("accepts valid tool subsets", () => {
      assert.ok(isValidAllowedTools(["Bash", "Read"]));
      assert.ok(isValidAllowedTools(["Bash", "Write", "Edit", "Read", "Glob", "Grep"]));
      assert.ok(isValidAllowedTools([]));
    });

    it("rejects invalid tool names", () => {
      assert.ok(!isValidAllowedTools(["Bash", "Agent"]));
      assert.ok(!isValidAllowedTools(["TodoWrite"]));
      assert.ok(!isValidAllowedTools(["mcp__runpod__delete-pod"]));
    });
  });

  describe("isBlockedEnvKey", () => {
    it("blocks RELAY_ prefixed keys", () => {
      assert.ok(isBlockedEnvKey("RELAY_AUTH_TOKEN"));
      assert.ok(isBlockedEnvKey("RELAY_PORT"));
      assert.ok(isBlockedEnvKey("RELAY_WORKSPACE"));
    });

    it("blocks system variables", () => {
      assert.ok(isBlockedEnvKey("PATH"));
      assert.ok(isBlockedEnvKey("HOME"));
      assert.ok(isBlockedEnvKey("NODE_OPTIONS"));
      assert.ok(isBlockedEnvKey("NODE_PATH"));
    });

    it("allows normal env vars", () => {
      assert.ok(!isBlockedEnvKey("CUDA_VISIBLE_DEVICES"));
      assert.ok(!isBlockedEnvKey("BATCH_SIZE"));
      assert.ok(!isBlockedEnvKey("LEARNING_RATE"));
      assert.ok(!isBlockedEnvKey("ANTHROPIC_API_KEY"));
    });
  });

  describe("validateEnvConfig", () => {
    it("returns null for valid config", () => {
      assert.equal(
        validateEnvConfig({ CUDA_VISIBLE_DEVICES: "0", BATCH_SIZE: "32" }),
        null,
      );
    });

    it("returns error for blocked key", () => {
      const result = validateEnvConfig({ RELAY_AUTH_TOKEN: "hack" });
      assert.ok(result !== null);
      assert.ok(result.includes("RELAY_AUTH_TOKEN"));
    });

    it("returns null for empty config", () => {
      assert.equal(validateEnvConfig({}), null);
    });
  });

  describe("validateTaskPayload", () => {
    const validPayload: TaskPayload = {
      experimentPlan: "# Experiment\nTrain a model",
      checkpoints: ["setup", "training", "evaluation"],
      modelConfig: { apiKey: "sk-test-123" },
    };

    it("accepts valid payload", () => {
      assert.equal(validateTaskPayload(validPayload), null);
    });

    it("accepts payload with optional fields", () => {
      const payload: TaskPayload = {
        ...validPayload,
        allowedTools: ["Bash", "Read"],
        envConfig: { BATCH_SIZE: "32" },
        stallTimeoutMs: 600000,
      };
      assert.equal(validateTaskPayload(payload), null);
    });

    it("rejects empty experimentPlan", () => {
      const payload = { ...validPayload, experimentPlan: "" };
      assert.ok(validateTaskPayload(payload) !== null);
    });

    it("rejects whitespace-only experimentPlan", () => {
      const payload = { ...validPayload, experimentPlan: "   " };
      assert.ok(validateTaskPayload(payload) !== null);
    });

    it("rejects empty checkpoints", () => {
      const payload = { ...validPayload, checkpoints: [] };
      assert.ok(validateTaskPayload(payload) !== null);
    });

    it("rejects missing apiKey", () => {
      const payload = {
        ...validPayload,
        modelConfig: { apiKey: "" },
      };
      assert.ok(validateTaskPayload(payload) !== null);
    });

    it("rejects invalid allowedTools", () => {
      const payload = {
        ...validPayload,
        allowedTools: ["Bash", "Agent"] as any,
      };
      assert.ok(validateTaskPayload(payload) !== null);
    });

    it("rejects blocked envConfig keys", () => {
      const payload = {
        ...validPayload,
        envConfig: { RELAY_AUTH_TOKEN: "hack" },
      };
      assert.ok(validateTaskPayload(payload) !== null);
    });
  });

  describe("type structure smoke tests", () => {
    it("TaskInfo has required fields", () => {
      const info: TaskInfo = {
        taskId: "t-1",
        status: "running",
        phase: "training",
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      assert.equal(info.taskId, "t-1");
      assert.equal(info.status, "running");
    });

    it("Report has required fields", () => {
      const report: Report = {
        phase: "training",
        summary: "Epoch 5 complete",
        details: "# Training\nLoss: 0.5",
        files: ["model.pt", "logs/train.log"],
        metrics: { loss: 0.5, accuracy: 0.85 },
      };
      assert.equal(report.phase, "training");
      assert.equal(report.files.length, 2);
    });

    it("Feedback has required fields", () => {
      const fb: Feedback = { action: "continue", message: "Looks good" };
      assert.equal(fb.action, "continue");
    });

    it("HealthInfo has required fields", () => {
      const health: HealthInfo = {
        status: "busy",
        uptime: 3600,
        currentTask: { taskId: "t-1", status: "running" },
      };
      assert.equal(health.status, "busy");
    });

    it("WorkerEntry has required fields", () => {
      const entry: WorkerEntry = {
        workerId: "w-1",
        url: "https://pod-123-8080.proxy.runpod.net",
        name: "gpu-worker-1",
        registeredAt: new Date().toISOString(),
      };
      assert.equal(entry.workerId, "w-1");
    });

    it("PersistedState has required fields", () => {
      const state: PersistedState = {
        task: null,
        sessionId: null,
        feedbackCounter: 0,
        history: [],
      };
      assert.equal(state.feedbackCounter, 0);
      assert.equal(state.history.length, 0);
    });
  });
});

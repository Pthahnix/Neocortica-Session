// Local MCP server entry point — registers 9 tools for Claude Code

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WorkerRegistry } from "./worker_registry.js";
import { TaskTracker } from "./task_tracker.js";
import { HttpTransport } from "./http_transport.js";
import { workerRegisterSchema, workerRegister } from "./tools/worker_register.js";
import { workerUnregisterSchema, workerUnregister } from "./tools/worker_unregister.js";
import { workerList } from "./tools/worker_list.js";
import { taskDispatchSchema, taskDispatch } from "./tools/task_dispatch.js";
import { taskStatusSchema, taskStatus } from "./tools/task_status.js";
import { taskReportSchema, taskReport } from "./tools/task_report.js";
import { taskFeedbackSchema, taskFeedback } from "./tools/task_feedback.js";
import { taskFilesSchema, taskFiles } from "./tools/task_files.js";
import { taskAbortSchema, taskAbort } from "./tools/task_abort.js";
import { join } from "node:path";
import { homedir } from "node:os";

const RELAY_AUTH_TOKEN = process.env.RELAY_AUTH_TOKEN ?? "";
const RELAY_DATA_DIR = process.env.RELAY_DATA_DIR ?? join(homedir(), ".neocortica-relay");

async function main() {
  const registry = new WorkerRegistry(RELAY_DATA_DIR);
  await registry.load();

  const tracker = new TaskTracker(RELAY_DATA_DIR);
  await tracker.load();

  const transport = new HttpTransport({ authToken: RELAY_AUTH_TOKEN });

  const server = new McpServer({
    name: "neocortica-relay",
    version: "0.1.0",
  });

  // Worker management tools
  server.tool(
    "worker_register",
    "Register a remote worker (RunPod pod). Performs health check before registering.",
    workerRegisterSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: await workerRegister(input, registry, transport) }],
    }),
  );

  server.tool(
    "worker_unregister",
    "Unregister a remote worker.",
    workerUnregisterSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: await workerUnregister(input, registry) }],
    }),
  );

  server.tool(
    "worker_list",
    "List all registered workers with their health status.",
    {},
    async () => ({
      content: [{ type: "text", text: await workerList(registry) }],
    }),
  );

  // Task management tools
  server.tool(
    "task_dispatch",
    "Dispatch an experiment task to a worker. Sends experiment plan and checkpoints.",
    taskDispatchSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: await taskDispatch(input, registry, tracker, transport) }],
    }),
  );

  server.tool(
    "task_status",
    "Get current status of a dispatched task from the worker.",
    taskStatusSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: await taskStatus(input, registry, tracker, transport) }],
    }),
  );

  server.tool(
    "task_report",
    "Get the latest checkpoint report from a task awaiting approval.",
    taskReportSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: await taskReport(input, registry, tracker, transport) }],
    }),
  );

  server.tool(
    "task_feedback",
    "Send feedback (continue/revise/abort) to a task at a checkpoint.",
    taskFeedbackSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: await taskFeedback(input, registry, tracker, transport) }],
    }),
  );

  server.tool(
    "task_files",
    "Download a file from the worker's experiment directory.",
    taskFilesSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: await taskFiles(input, registry, tracker, transport) }],
    }),
  );

  server.tool(
    "task_abort",
    "Abort a running task on a worker.",
    taskAbortSchema.shape,
    async (input) => ({
      content: [{ type: "text", text: await taskAbort(input, registry, tracker, transport) }],
    }),
  );

  // Start stdio transport
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});

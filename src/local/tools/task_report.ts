// MCP Tool: task_report — get checkpoint report from worker
import { z } from "zod";
import type { WorkerRegistry } from "../worker_registry.js";
import type { TaskTracker } from "../task_tracker.js";
import type { ITransport } from "../http_transport.js";

export const taskReportSchema = z.object({
  taskId: z.string().describe("Task ID to get report for"),
});

export type TaskReportInput = z.infer<typeof taskReportSchema>;

export async function taskReport(
  input: TaskReportInput,
  registry: WorkerRegistry,
  tracker: TaskTracker,
  transport: ITransport,
): Promise<string> {
  const tracked = tracker.get(input.taskId);
  if (!tracked) {
    return JSON.stringify({ ok: false, error: `Task not found: ${input.taskId}` });
  }

  const worker = registry.get(tracked.workerId);
  if (!worker) {
    return JSON.stringify({ ok: false, error: `Worker not found: ${tracked.workerId}` });
  }

  try {
    const report = await transport.report(worker.url, input.taskId);
    return JSON.stringify({ ok: true, report });
  } catch (err: any) {
    return JSON.stringify({ ok: false, error: err.message });
  }
}

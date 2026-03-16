// MCP Tool: task_abort — abort a running task on worker
import { z } from "zod";
import type { WorkerRegistry } from "../worker_registry.js";
import type { TaskTracker } from "../task_tracker.js";
import type { ITransport } from "../http_transport.js";

export const taskAbortSchema = z.object({
  taskId: z.string().describe("Task ID to abort"),
});

export type TaskAbortInput = z.infer<typeof taskAbortSchema>;

export async function taskAbort(
  input: TaskAbortInput,
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
    await transport.abort(worker.url, input.taskId);
    await tracker.update(input.taskId, { status: "aborted" });
    return JSON.stringify({ ok: true });
  } catch (err: any) {
    return JSON.stringify({ ok: false, error: err.message });
  }
}

// MCP Tool: task_status — get task status from worker
import { z } from "zod";
import type { WorkerRegistry } from "../worker_registry.js";
import type { TaskTracker } from "../task_tracker.js";
import type { ITransport } from "../http_transport.js";

export const taskStatusSchema = z.object({
  taskId: z.string().describe("Task ID to query"),
});

export type TaskStatusInput = z.infer<typeof taskStatusSchema>;

export async function taskStatus(
  input: TaskStatusInput,
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
    return JSON.stringify({ ok: false, error: `Worker not found: ${tracked.workerId}`, lastKnown: tracked });
  }

  try {
    const info = await transport.status(worker.url, input.taskId);
    await tracker.update(input.taskId, {
      status: info.status,
      phase: info.phase,
      progress: info.progress,
      error: info.error,
    });
    return JSON.stringify({ ok: true, task: { ...info, workerId: tracked.workerId } });
  } catch (err: any) {
    return JSON.stringify({ ok: false, error: err.message, lastKnown: tracked });
  }
}

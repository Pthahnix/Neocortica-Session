// MCP Tool: task_feedback — send feedback to worker for checkpoint approval
import { z } from "zod";
import type { WorkerRegistry } from "../worker_registry.js";
import type { TaskTracker } from "../task_tracker.js";
import type { ITransport } from "../http_transport.js";
import type { Feedback, FeedbackAction } from "../../shared/types.js";

export const taskFeedbackSchema = z.object({
  taskId: z.string().describe("Task ID to send feedback for"),
  action: z.enum(["continue", "revise", "abort"]).describe("Feedback action"),
  message: z.string().optional().describe("Optional feedback message"),
});

export type TaskFeedbackInput = z.infer<typeof taskFeedbackSchema>;

export async function taskFeedback(
  input: TaskFeedbackInput,
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

  const feedback: Feedback = {
    action: input.action as FeedbackAction,
    message: input.message,
  };

  try {
    await transport.feedback(worker.url, input.taskId, feedback);
    // Update local tracker
    if (input.action === "abort") {
      await tracker.update(input.taskId, { status: "aborted" });
    } else {
      await tracker.update(input.taskId, { status: "running" });
    }
    return JSON.stringify({ ok: true });
  } catch (err: any) {
    return JSON.stringify({ ok: false, error: err.message });
  }
}

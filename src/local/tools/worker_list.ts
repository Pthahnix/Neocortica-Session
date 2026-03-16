// MCP Tool: worker_list — list all registered workers
import type { WorkerRegistry } from "../worker_registry.js";

export async function workerList(registry: WorkerRegistry): Promise<string> {
  const workers = registry.list();
  return JSON.stringify({ workers, count: workers.length });
}

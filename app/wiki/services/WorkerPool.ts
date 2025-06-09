export interface WorkerTask<T = any, R = any> {
  id: string;
  data: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private activeTasks = new Map<string, WorkerTask>();
  private workerCount: number;

  constructor(
    workerScript: string,
    workerCount: number = navigator.hardwareConcurrency || 4
  ) {
    this.workerCount = Math.min(workerCount, 8); // Cap at 8 workers
    this.initializeWorkers(workerScript);
  }

  private initializeWorkers(workerScript: string) {
    for (let i = 0; i < this.workerCount; i++) {
      try {
        // Use the worker script from public directory
        const worker = new Worker(workerScript);

        worker.onmessage = (e) => {
          this.handleWorkerMessage(worker, e);
        };

        worker.onerror = (error) => {
          console.error("Worker error:", error);
          this.handleWorkerError(worker, error);
        };

        this.workers.push(worker);
        this.availableWorkers.push(worker);
      } catch (error) {
        console.error("Failed to create worker:", error);
      }
    }

    if (this.workers.length === 0) {
      throw new Error("Failed to create any workers");
    }
  }

  private handleWorkerMessage(worker: Worker, e: MessageEvent) {
    const response = e.data;
    const task = this.activeTasks.get(response.id);

    if (task) {
      this.activeTasks.delete(response.id);
      this.availableWorkers.push(worker);

      if (response.success) {
        task.resolve(response);
      } else {
        task.reject(new Error(response.error || "Worker task failed"));
      }

      // Process next task in queue
      this.processNextTask();
    }
  }

  private handleWorkerError(worker: Worker, error: ErrorEvent) {
    let detailedErrorMessage: string;
    if (error.message) {
      detailedErrorMessage = error.message;
    } else {
      detailedErrorMessage = `Worker script error at ${
        error.filename || "unknown file"
      }:${error.lineno || "unknown line"}:${
        error.colno || "unknown col"
      } (message undefined)`;
    }

    console.error("Worker failed:", detailedErrorMessage, error);

    // Find and reject all tasks assigned to this worker
    const tasksToReject: string[] = [];
    for (const [taskId, task] of this.activeTasks.entries()) {
      // For simplicity, we'll reject all active tasks when any worker fails
      // In a more sophisticated implementation, we'd track which worker handles which task
      task.reject(new Error(`Worker error: ${detailedErrorMessage}`));
      tasksToReject.push(taskId);
    }

    // Clean up rejected tasks
    tasksToReject.forEach((taskId) => this.activeTasks.delete(taskId));

    // Remove the failed worker
    const index = this.workers.indexOf(worker);
    if (index > -1) {
      this.workers.splice(index, 1);
    }

    const availableIndex = this.availableWorkers.indexOf(worker);
    if (availableIndex > -1) {
      this.availableWorkers.splice(availableIndex, 1);
    }

    worker.terminate();

    // If we have no workers left, reject all queued tasks
    if (this.workers.length === 0) {
      while (this.taskQueue.length > 0) {
        const task = this.taskQueue.shift()!;
        task.reject(
          new Error(`All workers failed. Last error: ${detailedErrorMessage}`)
        );
      }
    }
  }

  private processNextTask() {
    if (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
      const task = this.taskQueue.shift()!;
      const worker = this.availableWorkers.shift()!;

      this.activeTasks.set(task.id, task);
      worker.postMessage({ id: task.id, ...task.data });
    }
  }

  public execute<T, R>(data: T): Promise<R> {
    return new Promise((resolve, reject) => {
      const task: WorkerTask<T, R> = {
        id: Math.random().toString(36).substr(2, 9),
        data,
        resolve,
        reject,
      };

      if (this.availableWorkers.length > 0) {
        const worker = this.availableWorkers.shift()!;
        this.activeTasks.set(task.id, task);
        worker.postMessage({ id: task.id, ...data });
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  public getStats() {
    return {
      totalWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      activeTasks: this.activeTasks.size,
      queuedTasks: this.taskQueue.length,
    };
  }

  public terminate() {
    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.availableWorkers = [];
    this.taskQueue = [];
    this.activeTasks.clear();
  }
}

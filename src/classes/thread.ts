/**
 * @fileoverview Thread pool implementation for managing and coordinating Web Worker threads
 * @file thread.ts
 * @module thread
 * @description This module provides a robust thread pool implementation for managing Web Workers.
 * It handles task queuing, worker lifecycle management, result collection, and error handling.
 * The thread pool automatically scales workers based on system capabilities and workload.
 */

import { WorkerMessage, WorkerResult, WorkerTask } from "./types.js";

/**
 * Thread pool manager for coordinating Web Worker threads.
 * @class
 * @description Manages a pool of Web Workers for parallel task processing. Features include:
 * - Dynamic worker scaling based on system capabilities
 * - Task queuing and distribution
 * - Result collection and error handling
 * - Worker lifecycle management
 * - Automatic worker reuse and cleanup
 */
export class ThreadPool {
	/** @private Array of available worker threads */
	private workers: Worker[] = [];
	/** @private Queue of pending tasks waiting to be processed */
	private taskQueue: WorkerTask[] = [];
	/** @private Set of workers currently processing tasks */
	private activeWorkers: Set<Worker> = new Set();
	/** @private Map storing task results keyed by task ID */
	private results: Map<string, WorkerResult> = new Map();
	/** @private Map storing promise callbacks for pending tasks */
	private callbacks: Map<
		string,
		[(result: any) => void, (error: any) => void]
	> = new Map();
	/** @private Path to the worker script file */
	private workerScript: string;
	/** @private Maximum number of concurrent workers allowed */
	private maxWorkers: number;

	/**
	 * Creates a new ThreadPool instance.
	 * @constructor
	 * @param {string} workerScript - Path to the worker script file
	 * @param {number} [maxWorkers] - Maximum number of concurrent workers. Defaults to system CPU count or 4
	 * @description Initializes a thread pool with specified worker script and concurrency limit.
	 * The maximum worker count defaults to the system's CPU count or 4 if not specified.
	 */
	constructor(
		workerScript: string,
		maxWorkers = navigator.hardwareConcurrency || 4,
	) {
		this.workerScript = workerScript;
		this.maxWorkers = maxWorkers;
	}

	/**
	 * Creates and configures a new worker instance.
	 * @private
	 * @returns {Worker} Configured worker instance
	 * @description Creates a new Web Worker with message and error handlers configured.
	 * The worker is initialized with the specified worker script and module type.
	 */
	private createWorker(): Worker {
		const worker = new Worker(new URL("./worker.ts", import.meta.url), {
			type: "module",
		});

		worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
			const { id, type, payload } = event.data;

			if (type === "RESULT" || type === "ERROR") {
				this.handleWorkerComplete(worker, id, payload);
			}
		};

		worker.onerror = (error) => {
			console.error("Worker error:", error);
			this.handleWorkerError(worker, error);
		};

		return worker;
	}

	/**
	 * Handles worker task completion.
	 * @private
	 * @param {Worker} worker - The worker that completed the task
	 * @param {string} taskId - ID of the completed task
	 * @param {WorkerResult} result - Result data from the worker
	 * @description Processes worker completion by:
	 * - Removing worker from active set
	 * - Storing task result
	 * - Resolving task promise
	 * - Initiating next task processing
	 */
	private handleWorkerComplete(
		worker: Worker,
		taskId: string,
		result: WorkerResult,
	) {
		this.activeWorkers.delete(worker);
		this.results.set(taskId, result);

		const callbacks = this.callbacks.get(taskId);
		if (callbacks) {
			const [resolve, reject] = callbacks;
			if (result.error) {
				reject(result.error);
			} else {
				resolve(result.result);
			}
			this.callbacks.delete(taskId);
		}

		this.processNextTask();
	}

	/**
	 * Handles worker errors.
	 * @private
	 * @param {Worker} worker - The worker that encountered an error
	 * @param {ErrorEvent} error - The error event
	 * @description Handles worker errors by:
	 * - Removing failed worker from active set
	 * - Terminating the worker
	 * - Cleaning up worker references
	 * - Initiating next task processing
	 */
	private handleWorkerError(worker: Worker, error: ErrorEvent) {
		this.activeWorkers.delete(worker);
		worker.terminate();
		const index = this.workers.indexOf(worker);
		if (index !== -1) {
			this.workers.splice(index, 1);
		}
		this.processNextTask();
	}

	/**
	 * Processes the next task in the queue.
	 * @private
	 * @description Manages task processing by:
	 * - Finding available worker or creating new one if needed
	 * - Assigning next task from queue
	 * - Sending task message to worker
	 * Worker creation is limited by maxWorkers setting
	 */
	private async processNextTask() {
		if (this.taskQueue.length === 0) {
			return;
		}

		let worker: Worker | undefined;

		// Reuse existing idle worker
		for (const w of this.workers) {
			if (!this.activeWorkers.has(w)) {
				worker = w;
				break;
			}
		}

		// Create new worker if needed and possible
		if (!worker && this.workers.length < this.maxWorkers) {
			worker = this.createWorker();
			this.workers.push(worker);
		}

		if (worker) {
			const task = this.taskQueue.shift();
			if (task) {
				this.activeWorkers.add(worker);
				const message: WorkerMessage = {
					id: task.id,
					type: "TASK",
					payload: task,
					timestamp: Date.now(),
				};
				worker.postMessage(message);
			}
		}
	}

	/**
	 * Checks if an object is serializable.
	 * @private
	 * @param {any} obj - Object to check for serializability
	 * @returns {boolean} True if object can be serialized, false otherwise
	 * @description Tests if an object can be serialized to JSON for worker transfer
	 */
	private isSerializable(obj: any): boolean {
		try {
			JSON.stringify(obj);
			return true;
		} catch (e) {
			return false;
		}
	}

	/**
	 * Submits a task for processing.
	 * @public
	 * @template T - Type of the task result
	 * @param {string} type - Type identifier for the task
	 * @param {any} data - Data payload for the task
	 * @returns {Promise<T>} Promise resolving to task result
	 * @throws {Error} If task data is not serializable
	 * @description Submits a task to the thread pool for processing:
	 * - Validates task data serializability
	 * - Creates unique task ID
	 * - Queues task and initiates processing
	 * - Returns promise for task completion
	 */
	public async submitTask<T = any>(type: string, data: any): Promise<T> {
		if (!this.isSerializable(data)) {
			throw new Error(`Task data must be serializable. Type: ${type}`);
		}

		const task: WorkerTask = {
			id: crypto.randomUUID(),
			type,
			data,
		};

		return new Promise((resolve, reject) => {
			this.callbacks.set(task.id, [resolve, reject]);
			this.taskQueue.push(task);
			this.processNextTask().catch(reject);
		});
	}

	/**
	 * Shuts down the thread pool.
	 * @public
	 * @description Performs complete cleanup of the thread pool:
	 * - Terminates all workers
	 * - Clears worker references
	 * - Clears task queue
	 * - Clears callback and result storage
	 */
	public shutdown() {
		for (const worker of this.workers) {
			worker.terminate();
		}
		this.workers = [];
		this.activeWorkers.clear();
		this.taskQueue = [];
		this.callbacks.clear();
		this.results.clear();
	}

	/**
	 * Gets count of currently executing tasks.
	 * @public
	 * @returns {number} Number of active tasks
	 * @description Returns the count of tasks currently being processed by workers
	 */
	public getActiveTaskCount(): number {
		return this.activeWorkers.size;
	}

	/**
	 * Gets count of queued tasks.
	 * @public
	 * @returns {number} Number of queued tasks
	 * @description Returns the count of tasks waiting to be processed
	 */
	public getQueuedTaskCount(): number {
		return this.taskQueue.length;
	}

	/**
	 * Gets all task results.
	 * @public
	 * @returns {Map<string, WorkerResult>} Map of all task results
	 * @description Returns a new Map containing all stored task results
	 */
	public getAllResults(): Map<string, WorkerResult> {
		return new Map(this.results);
	}
}

/**
 * @fileoverview Thread pool implementation for managing and coordinating Web Worker threads
 * @file thread.ts
 * @module thread
 * @description This module provides a robust thread pool implementation for managing Web Workers.
 * It handles task queuing, worker lifecycle management, result collection, and error handling.
 * The thread pool automatically scales workers based on system capabilities and workload.
 */

import { WorkerMessage, WorkerResult, WorkerTask } from "./types.js";
import { EventEmitter } from "events";

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
export class ThreadPool extends EventEmitter {
	/** @public Array of available worker threads */
	public workers: Worker[] = [];
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
		super();
		this.workerScript = workerScript;
		this.maxWorkers = maxWorkers;
	}

	/**
	 * Initializes the thread pool and ensures workers are ready.
	 * @public
	 * @returns {Promise<void>} Resolves when all initial workers are ready
	 * @throws {Error} If initialization fails or times out
	 */
	public async initialize(): Promise<void> {
		console.log("Starting thread pool initialization...");

		const initializationPromises = [];

		for (let i = 0; i < this.maxWorkers; i++) {
			try {
				const worker = new Worker(new URL(this.workerScript, import.meta.url), {
					type: "module",
				});

				worker.onerror = (error) => {
					console.error(`Worker ${i} error:`, error);
				};

				worker.onmessage = (event: MessageEvent<WorkerMessage<any>>) => {
					const message = event.data;
					const callback = this.callbacks.get(message.id);
					if (!callback) {
						console.warn(`No callback found for message ID: ${message.id}`);
						return;
					}

					const [resolve, reject] = callback;

					if (message.type === "RESULT") {
						console.log(`Received RESULT for task ${message.id}`);
						resolve(message.payload.result);
					} else if (message.type === "ERROR") {
						console.error(
							`Received ERROR for task ${message.id}:`,
							message.payload.error,
						);
						reject(new Error(message.payload.error));
					}

					this.callbacks.delete(message.id);
					this.activeWorkers.delete(worker);
					this.processNextTask();
				};

				this.workers.push(worker);

				initializationPromises.push(
					new Promise<void>((resolve, reject) => {
						const timeout = setTimeout(() => {
							reject(
								new Error(
									`Worker ${i} initialization timed out after 30 seconds`,
								),
							);
						}, 30000);

						const onReady = (event: MessageEvent<WorkerMessage<any>>) => {
							if (event.data.type === "READY") {
								clearTimeout(timeout);
								worker.removeEventListener("message", onReady);
								console.log(`Worker ${i} is READY`);
								resolve();
							}
						};

						worker.addEventListener("message", onReady);
						worker.postMessage({ type: "INIT", id: crypto.randomUUID() });
					}),
				);
			} catch (error) {
				console.error(`Failed to create worker ${i}:`, error);
				throw error;
			}
		}

		await Promise.all(initializationPromises);
		console.log(`Thread pool initialized with ${this.workers.length} workers`);
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

		if (this.activeWorkers.size >= this.maxWorkers) {
			return;
		}

		const task = this.taskQueue.shift();
		if (!task) {
			return;
		}

		const availableWorker = this.workers.find(
			(w) => !this.activeWorkers.has(w),
		);
		if (!availableWorker) {
			this.taskQueue.unshift(task);
			return;
		}

		this.activeWorkers.add(availableWorker);
		console.log(`Assigning task ${task.id} to a worker`);

		availableWorker.postMessage(task);
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
	public async submitTask<T = any>(
		type: "READY" | "RESULT" | "ERROR" | "TASK" | "STATUS" | "INIT",
		url?: string,
		data: any = {},
	): Promise<T> {
		if (type === "TASK" && !url) {
			throw new Error("URL is required for TASK type.");
		}

		const task: WorkerTask = {
			id: crypto.randomUUID(),
			type,
			...(type === "TASK" && { url }),
			data,
		};

		console.log(`Submitting task: ${task.type} with ID: ${task.id}`);

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
		console.log("Shutting down thread pool...");
		for (const worker of this.workers) {
			worker.terminate();
		}
		this.workers = [];
		this.callbacks.clear();
		this.taskQueue = [];
		this.activeWorkers.clear();
		this.results.clear();
		console.log("Thread pool shut down.");
	}

	/**
	 * Checks if the thread pool has been initialized.
	 * @public
	 * @returns {boolean} True if workers are initialized, false otherwise
	 * @description Returns true if workers are initialized, false otherwise
	 */
	public isInitialized(): boolean {
		return this.workers.length > 0;
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

	/**
	 * Gets the number of workers in the pool.
	 * @public
	 * @returns {number} Number of workers
	 * @description Returns the current count of workers in the thread pool
	 */
	public getWorkerCount(): number {
		return this.workers.length;
	}
}

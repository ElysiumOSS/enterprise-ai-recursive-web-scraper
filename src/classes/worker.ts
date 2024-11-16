/**
 * @fileoverview Worker thread implementation for handling asynchronous tasks in a web worker context
 * @file worker.ts
 * @module worker
 * @description This module provides a worker thread implementation that can handle different types of tasks,
 * measure execution time, and communicate results back to the main thread. It supports:
 * - Registration of task-specific handlers
 * - Default task handling
 * - Error handling and reporting
 * - Performance measurement
 * - Type-safe message passing
 */

import { WorkerMessage, WorkerResult } from "./types.js";

/**
 * Worker thread class for handling asynchronous tasks
 * @class WorkerThread
 * @description Manages task execution within a web worker context. Features include:
 * - Task handler registration and management
 * - Message handling and response formatting
 * - Error handling and reporting
 * - Performance measurement
 * - Default task handling fallback
 */
export class WorkerThread {
	/**
	 * Map storing task handlers keyed by task type
	 * @private
	 * @type {Map<string, (data: any) => Promise<any>>}
	 */
	private taskHandlers: Map<string, (data: any) => Promise<any>> = new Map();

	/**
	 * Initializes a new WorkerThread instance
	 * @constructor
	 * @description Sets up message handling and registers default task handler.
	 * The default handler simply returns the input data unchanged.
	 */
	constructor() {
		self.onmessage = this.handleMessage.bind(this);

		this.registerTaskHandler("DEFAULT", async (data) => {
			return data;
		});
	}

	/**
	 * Handles incoming messages from the main thread
	 * @private
	 * @param {MessageEvent<WorkerMessage>} event - Message event containing task data
	 * @description Processes incoming task messages by:
	 * - Extracting task information
	 * - Finding appropriate handler
	 * - Measuring execution time
	 * - Sending results or errors back to main thread
	 * @throws {Error} When no handler is registered for the task type
	 */
	private async handleMessage(event: MessageEvent<WorkerMessage>) {
		const { id, type, payload } = event.data;

		if (type === "TASK") {
			try {
				const startTime = performance.now();
				const handler =
					this.taskHandlers.get(payload.type) ||
					this.taskHandlers.get("DEFAULT");

				if (!handler) {
					throw new Error(
						`No handler registered for task type: ${payload.type}`,
					);
				}

				const result = await handler(payload.data);
				const executionTime = performance.now() - startTime;

				const response: WorkerMessage<WorkerResult> = {
					id,
					type: "RESULT",
					payload: {
						taskId: payload.id,
						result,
						executionTime,
					},
					timestamp: Date.now(),
				};

				self.postMessage(response);
			} catch (error) {
				const errorResponse: WorkerMessage = {
					id,
					type: "ERROR",
					payload: {
						taskId: payload.id,
						error: error instanceof Error ? error.message : String(error),
					},
					timestamp: Date.now(),
				};

				self.postMessage(errorResponse);
			}
		}
	}

	/**
	 * Registers a new task handler
	 * @public
	 * @param {string} type - Type identifier for the task
	 * @param {(data: any) => Promise<any>} handler - Async function to handle the task
	 * @description Adds a new task handler to the handler map. If a handler already exists
	 * for the given type, it will be overwritten. The handler should be an async function
	 * that takes task data as input and returns a promise resolving to the result.
	 */
	public registerTaskHandler(
		type: string,
		handler: (data: any) => Promise<any>,
	) {
		this.taskHandlers.set(type, handler);
	}
}

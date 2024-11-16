import { WorkerMessage, WorkerResult } from "./types.js";

export class WorkerThread {
	private taskHandlers: Map<string, (data: any) => Promise<any>> = new Map();

	constructor() {
		self.onmessage = this.handleMessage.bind(this);

		this.registerTaskHandler("DEFAULT", async (data) => {
			return data;
		});
	}

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

	public registerTaskHandler(
		type: string,
		handler: (data: any) => Promise<any>,
	) {
		this.taskHandlers.set(type, handler);
	}
}

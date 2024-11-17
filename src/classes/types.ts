export interface WorkerMessage<T = any> {
	id: string;
	type: "TASK" | "RESULT" | "ERROR" | "STATUS" | "READY" | "INIT";
	payload: T;
	timestamp: number;
}

export interface WorkerTask {
	id: string;
	type: "TASK" | "RESULT" | "ERROR" | "STATUS" | "READY" | "INIT";
	url?: string;
	data?: any;
}

export interface WorkerResult {
	taskId: string;
	result: any;
	error?: string;
	executionTime?: number;
}

export interface TrieNode {
	children: { [key: string]: TrieNode };
	isEndOfWord: boolean;
}

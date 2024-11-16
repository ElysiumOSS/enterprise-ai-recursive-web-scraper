export interface WorkerMessage<T = any> {
	id: string;
	type: "TASK" | "RESULT" | "ERROR" | "STATUS";
	payload: T;
	timestamp: number;
}

export interface WorkerTask {
	id: string;
	data: any;
	type: string;
}

export interface WorkerResult {
	taskId: string;
	result: any;
	error?: string;
	executionTime?: number;
}

export interface Row {
	text: string;
}

export interface TrieNode {
	children: { [key: string]: TrieNode };
	isEndOfWord: boolean;
}

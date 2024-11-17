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

import { WorkerMessage, WorkerTask } from "./types.js";
import { scrape } from "./scraper.js";
import puppeteer, { PuppeteerExtra } from "puppeteer-extra";
import { Browser } from "puppeteer";

let browser: Browser | null = null;
const puppeteerExtra = puppeteer as unknown as PuppeteerExtra;

/**
 * Helper function to create and send worker messages
 * @param type Message type
 * @param id Message ID
 * @param payload Message payload
 */
function sendMessage(
	type: "READY" | "RESULT" | "ERROR",
	id: string,
	payload: any,
) {
	self.postMessage({
		type,
		id,
		payload,
		timestamp: Date.now(),
	} as WorkerMessage);
}

self.addEventListener(
	"message",
	async (event: MessageEvent<WorkerMessage<WorkerTask>>) => {
		const startTime = Date.now();
		const message = event.data;

		try {
			switch (message.type) {
				case "INIT":
					try {
						browser = await puppeteerExtra.launch({
							headless: true,
							args: ["--no-sandbox", "--disable-setuid-sandbox"],
							timeout: 30000,
						});

						sendMessage("READY", message.id, {
							initialized: true,
							timestamp: Date.now(),
						});
					} catch (error) {
						console.error("Browser initialization failed:", error);
						sendMessage("ERROR", message.id, {
							error: error instanceof Error ? error.message : "Unknown error",
							executionTime: Date.now() - startTime,
						});
					}
					break;

				case "TASK":
					if (!browser) {
						sendMessage("ERROR", message.id, {
							error: "Browser not initialized",
							executionTime: Date.now() - startTime,
						});
						return;
					}

					if (!message.payload.url) {
						sendMessage("ERROR", message.id, {
							error: "URL is missing in TASK payload",
							executionTime: Date.now() - startTime,
						});
						return;
					}

					try {
						const result = await scrape(message.payload.url, browser);
						sendMessage("RESULT", message.id, {
							taskId: message.id,
							result,
							executionTime: Date.now() - startTime,
						});
					} catch (error) {
						sendMessage("ERROR", message.id, {
							taskId: message.id,
							error: error instanceof Error ? error.message : "Unknown error",
							executionTime: Date.now() - startTime,
						});
					}
					break;

				default:
					console.warn(`Unknown message type: ${message.type}`);
			}
		} catch (error) {
			console.error("Unexpected error:", error);
			sendMessage("ERROR", message.id, {
				error: error instanceof Error ? error.message : "Unknown error",
				executionTime: Date.now() - startTime,
			});
		}
	},
);

self.addEventListener("unload", async () => {
	if (browser) {
		try {
			await browser.close();
		} catch (error) {
			console.error("Error closing browser:", error);
		} finally {
			browser = null;
		}
	}
});

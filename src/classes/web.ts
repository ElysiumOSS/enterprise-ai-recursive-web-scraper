/**
 * @fileoverview Advanced web scraping and content processing system that provides comprehensive functionality
 * for recursive web crawling, content extraction, screenshot capture, and AI-powered content analysis.
 *
 * Key features:
 * - Multi-threaded web scraping using a thread pool for concurrent processing
 * - Recursive crawling of websites while respecting domain boundaries
 * - Automated screenshot capture at different scroll positions
 * - Content extraction and filtering using custom scraping logic
 * - AI-powered content analysis and structuring using Google's Gemini LLM
 * - File-based storage of raw and processed content with organized directory structure
 * - Error handling and recovery mechanisms
 *
 * The system is designed to be highly scalable and configurable while maintaining clean separation of concerns
 * between different processing stages.
 *
 * @module web
 * @requires playwright - For browser automation and screenshot capture
 * @requires node:path - For file path handling
 * @requires node:fs/promises - For async file operations
 * @requires ./thread.js - Thread pool implementation for concurrent processing
 * @requires ./scraper.js - Content extraction and filtering logic
 * @requires ../constants/gemini-settings.js - Configuration for Gemini LLM
 */

import { chromium, Browser, Page } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import { ThreadPool } from "./thread.js";
import { scrape } from "./scraper.js";
import { genAI } from "../constants/gemini-settings.js";
import { safetySettings } from "../constants/gemini-settings.js";

/**
 * Represents the complete result of processing a single web page, including all generated artifacts
 * and metadata.
 *
 * @interface PageResult
 * @property {string} url - The fully qualified URL of the processed web page
 * @property {string} contentPath - Filesystem path to the raw scraped content file
 * @property {string} processedContentPath - Filesystem path to the AI-processed and structured content file
 * @property {string[]} screenshots - Array of filesystem paths to captured page screenshots
 * @property {string} [error] - Optional error message if any stage of processing failed
 * @property {number} timestamp - Unix timestamp (in milliseconds) when processing completed
 *
 * @example
 * {
 *   url: 'https://example.com/page',
 *   contentPath: 'scraping_output/content/example_com_page_1234567890.txt',
 *   processedContentPath: 'scraping_output/processed/example_com_page_1234567890.txt',
 *   screenshots: [
 *     'scraping_output/screenshots/example_com_page_0.png',
 *     'scraping_output/screenshots/example_com_page_1.png'
 *   ],
 *   timestamp: 1234567890123
 * }
 */
interface PageResult {
	url: string;
	contentPath: string;
	processedContentPath: string;
	screenshots: string[];
	error?: string;
	timestamp: number;
}

/**
 * Core class implementing the web scraping and content processing system. Handles all aspects
 * of the scraping process from URL discovery to content storage.
 *
 * Key responsibilities:
 * - Managing concurrent processing through thread pool
 * - Coordinating browser automation and screenshot capture
 * - Handling content extraction and filtering
 * - Managing AI-powered content analysis
 * - Organizing file storage and directory structure
 * - Tracking processed URLs and maintaining results
 *
 * @class EnhancedWebScraper
 *
 * @property {ThreadPool} threadPool - Thread pool instance managing concurrent scraping workers
 * @property {Set<string>} processedUrls - Set of URLs that have been processed to prevent duplicates
 * @property {Map<string, PageResult>} results - Map storing processing results for each URL
 * @property {string} baseUrl - Base URL/domain for the current scraping session
 * @property {string} outputDir - Root directory for storing all generated files and artifacts
 *
 * @example
 * const scraper = new EnhancedWebScraper("output_dir", 8);
 * const results = await scraper.scrapeWebsite("https://example.com");
 * const processedContent = await scraper.loadProcessedContent(results.get("https://example.com"));
 */
export class EnhancedWebScraper {
	private threadPool: ThreadPool;
	private processedUrls: Set<string> = new Set();
	private results: Map<string, PageResult> = new Map();
	private baseUrl: string = "";
	private outputDir: string;

	/**
	 * Initializes a new EnhancedWebScraper instance with specified output directory and worker count.
	 *
	 * @constructor
	 * @param {string} outputDir - Root directory path where all scraped content and artifacts will be stored
	 * @param {number} maxWorkers - Maximum number of concurrent worker threads for parallel processing
	 *
	 * @throws {Error} If unable to initialize thread pool or create output directory
	 *
	 * @example
	 * // Create scraper with default settings
	 * const scraper = new EnhancedWebScraper();
	 *
	 * // Create scraper with custom output dir and 8 workers
	 * const customScraper = new EnhancedWebScraper("custom_output", 8);
	 */
	constructor(
		outputDir: string = "scraping_output",
		maxWorkers = navigator.hardwareConcurrency || 4,
	) {
		this.threadPool = new ThreadPool("./worker.js", maxWorkers);
		this.outputDir = outputDir;
	}

	/**
	 * Creates the required directory structure for storing all scraped content and artifacts.
	 * Ensures all necessary subdirectories exist before processing begins.
	 *
	 * Directory structure:
	 * - outputDir/
	 *   - content/      (raw scraped content)
	 *   - processed/    (AI-processed content)
	 *   - screenshots/  (page screenshots)
	 *
	 * @private
	 * @returns {Promise<void>} Resolves when all directories are created
	 * @throws {Error} If unable to create any required directory
	 */
	private async initializeDirectories(): Promise<void> {
		const dirs = [
			this.outputDir,
			path.join(this.outputDir, "content"),
			path.join(this.outputDir, "processed"),
			path.join(this.outputDir, "screenshots"),
		];

		await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));
	}

	/**
	 * Saves content to a file with a URL-based naming scheme that ensures uniqueness and traceability.
	 *
	 * File naming format: {sanitized_domain}{sanitized_path}_{timestamp}.txt
	 *
	 * @private
	 * @param {string} content - Content to be written to file
	 * @param {string} directory - Subdirectory within output directory (content/processed/screenshots)
	 * @param {string} url - Source URL used to generate unique filename
	 * @returns {Promise<string>} Full path to the saved file
	 *
	 * @throws {Error} If file writing fails
	 *
	 * @example
	 * // For URL "https://example.com/page"
	 * // Generates: "output_dir/content/example_com_page_1234567890.txt"
	 */
	private async saveToFile(
		content: string,
		directory: string,
		url: string,
	): Promise<string> {
		const urlObj = new URL(url);
		const sanitizedPath = urlObj.pathname
			.replace(/[^a-z0-9]/gi, "_")
			.toLowerCase();
		const sanitizedDomain = urlObj.hostname
			.replace(/[^a-z0-9]/gi, "_")
			.toLowerCase();
		const timestamp = Date.now();
		const fileName = `${sanitizedDomain}${sanitizedPath}_${timestamp}.txt`;
		const filePath = path.join(this.outputDir, directory, fileName);

		await fs.writeFile(filePath, content, "utf-8");
		return filePath;
	}

	/**
	 * Captures multiple screenshots of a webpage at different scroll positions to provide
	 * comprehensive visual coverage of the page content.
	 *
	 * Features:
	 * - Automatically determines optimal number of screenshots based on page height
	 * - Handles scrolling and timing for consistent captures
	 * - Generates unique filenames based on URL
	 * - Limits maximum screenshots to prevent excessive storage usage
	 *
	 * @private
	 * @param {Page} page - Playwright Page object representing the current page
	 * @param {string} url - URL of the page being captured
	 * @returns {Promise<string[]>} Array of paths to saved screenshot files
	 *
	 * @throws {Error} If screenshot capture or saving fails
	 *
	 * @example
	 * const screenshots = await takeScreenshots(page, "https://example.com");
	 * // Returns: ["path/to/screenshot_0.png", "path/to/screenshot_1.png", ...]
	 */
	private async takeScreenshots(page: Page, url: string): Promise<string[]> {
		const screenshots: string[] = [];
		const screenshotsDir = path.join(this.outputDir, "screenshots");

		const pageHeight = await page.evaluate(() => document.body.scrollHeight);
		const viewportHeight = 1080;
		const numScreenshots = Math.min(3, Math.ceil(pageHeight / viewportHeight));

		for (let i = 0; i < numScreenshots; i++) {
			const fileName = `${Buffer.from(url).toString("base64url")}_${i}.png`;
			const filePath = path.join(screenshotsDir, fileName);

			await page.evaluate((scrollPos) => {
				window.scrollTo(0, scrollPos);
			}, i * viewportHeight);

			await page.waitForTimeout(1000);

			await page.screenshot({
				path: filePath,
				fullPage: false,
			});

			screenshots.push(filePath);
		}

		return screenshots;
	}

	/**
	 * Processes raw scraped content using Google's Gemini LLM to create structured,
	 * analyzed content. The AI model extracts key information, identifies themes,
	 * and organizes content into a logical structure.
	 *
	 * Processing includes:
	 * - Topic and theme extraction
	 * - Key information identification
	 * - Content organization and structuring
	 * - Redundancy removal
	 *
	 * @private
	 * @param {string} content - Raw scraped content to be processed
	 * @returns {Promise<string>} AI-processed and structured content
	 *
	 * @throws {Error} If LLM processing fails or returns invalid response
	 *
	 * @example
	 * const rawContent = "Unstructured webpage content...";
	 * const processed = await processWithLLM(rawContent);
	 * // Returns structured markdown content with sections and highlights
	 */
	private async processWithLLM(content: string): Promise<string> {
		try {
			const prompt = `
        Please analyze and format the following web content into a structured format:
        - Extract main topics and themes
        - Identify key information and facts
        - Organize content into logical sections
        - Remove redundant or irrelevant information
        
        Content:
        ${content}
      `;

			const model = await genAI.getGenerativeModel({
				model: "gemini-1.5-flash",
				safetySettings,
			});

			const response = await model.generateContent(prompt);
			return response.response.text();
		} catch (error) {
			console.error("Error processing with LLM:", error);
			throw error;
		}
	}

	/**
	 * Processes a single webpage by coordinating all aspects of content extraction,
	 * screenshot capture, and analysis. This is the core processing function that
	 * brings together all components of the system.
	 *
	 * Processing steps:
	 * 1. Check for duplicate processing
	 * 2. Load page in browser
	 * 3. Capture screenshots
	 * 4. Extract and filter content
	 * 5. Process content with AI
	 * 6. Discover and queue new URLs
	 * 7. Save all artifacts
	 *
	 * @private
	 * @param {string} url - URL of the page to process
	 * @param {Browser} browser - Playwright Browser instance
	 * @returns {Promise<PageResult>} Complete processing results
	 *
	 * @throws {Error} If any critical processing step fails
	 *
	 * @example
	 * const result = await processSinglePage("https://example.com", browser);
	 * // Returns PageResult object with paths to all generated artifacts
	 */
	private async processSinglePage(
		url: string,
		browser: Browser,
	): Promise<PageResult> {
		if (this.processedUrls.has(url)) {
			return this.results.get(url)!;
		}

		try {
			const page = await browser.newPage();
			await page.goto(url, { waitUntil: "networkidle" });

			const screenshots = await this.takeScreenshots(page, url);
			const scrapedContent = await scrape(url);

			if ("error" in scrapedContent) {
				throw new Error(scrapedContent.error);
			}

			const filteredTexts = Array.isArray(scrapedContent.filteredTexts)
				? scrapedContent.filteredTexts.join("\n")
				: scrapedContent.filteredTexts;
			const contentPath = await this.saveToFile(filteredTexts, "content", url);

			const processedContent = await this.processWithLLM(filteredTexts);
			const processedContentPath = await this.saveToFile(
				processedContent,
				"processed",
				url,
			);

			const links = await page.evaluate(() => {
				return Array.from(document.querySelectorAll("a[href]"))
					.map((link) => link.getAttribute("href"))
					.filter(
						(href): href is string =>
							href !== null &&
							!href.startsWith("#") &&
							!href.startsWith("javascript:"),
					)
					.map((href) => new URL(href, window.location.href).href);
			});

			// Queue new URLs for processing
			for (const link of links) {
				if (link.startsWith(this.baseUrl) && !this.processedUrls.has(link)) {
					this.processedUrls.add(link); // Mark as processed immediately to prevent duplicates
					try {
						// Only pass the URL, not the browser instance
						await this.threadPool.submitTask("SCRAPE_PAGE", { url: link });
					} catch (error) {
						console.error(`Failed to queue URL ${link}:`, error);
					}
				}
			}

			const result: PageResult = {
				url,
				contentPath,
				processedContentPath,
				screenshots,
				timestamp: Date.now(),
			};

			this.results.set(url, result);
			await page.close();
			return result;
		} catch (error) {
			return {
				url,
				contentPath: "",
				processedContentPath: "",
				screenshots: [],
				error: error instanceof Error ? error.message : "Unknown error",
				timestamp: Date.now(),
			};
		}
	}

	/**
	 * Initiates a complete recursive website scraping operation starting from a given URL.
	 * Coordinates the entire scraping process including worker initialization, URL discovery,
	 * and content processing.
	 *
	 * Process flow:
	 * 1. Initialize directories and browser
	 * 2. Set up worker pool
	 * 3. Process initial URL
	 * 4. Monitor and process discovered URLs
	 * 5. Detect completion
	 * 6. Clean up resources
	 *
	 * @public
	 * @param {string} url - Starting URL for the scraping operation
	 * @returns {Promise<Map<string, PageResult>>} Map of all processing results keyed by URL
	 *
	 * @throws {Error} If initialization fails or critical processing error occurs
	 *
	 * @example
	 * const scraper = new EnhancedWebScraper();
	 * const results = await scraper.scrapeWebsite("https://example.com");
	 * // Returns map of PageResults for all processed pages
	 */
	public async scrapeWebsite(url: string): Promise<Map<string, PageResult>> {
		this.baseUrl = new URL(url).origin;
		await this.initializeDirectories();

		const browser = await chromium.launch({
			headless: true,
		});

		try {
			// Initialize the worker pool with the browser instance
			await this.threadPool.submitTask("INIT", { initialized: true });

			// Submit the initial URL for processing
			await this.processSinglePage(url, browser);

			// Process discovered URLs
			let lastQueueSize = 0;
			let stableCount = 0;

			while (true) {
				const activeCount = this.threadPool.getActiveTaskCount();
				const queuedCount = this.threadPool.getQueuedTaskCount();

				// If nothing is happening and queue hasn't changed in 3 checks, we're done
				if (activeCount === 0 && queuedCount === lastQueueSize) {
					stableCount++;
					if (stableCount >= 3) {
						break;
					}
				} else {
					stableCount = 0;
				}

				lastQueueSize = queuedCount;
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			return this.results;
		} finally {
			await browser.close();
			await this.threadPool.shutdown();
		}
	}

	/**
	 * Loads and returns the AI-processed content for a given page result.
	 *
	 * @public
	 * @param {PageResult} result - Page result object containing file paths
	 * @returns {Promise<string>} AI-processed and structured content
	 *
	 * @throws {Error} If file reading fails or file doesn't exist
	 *
	 * @example
	 * const content = await scraper.loadProcessedContent(result);
	 * // Returns structured content from processed file
	 */
	public async loadProcessedContent(result: PageResult): Promise<string> {
		return await fs.readFile(result.processedContentPath, "utf-8");
	}

	/**
	 * Loads and returns the raw scraped content for a given page result.
	 *
	 * @public
	 * @param {PageResult} result - Page result object containing file paths
	 * @returns {Promise<string>} Raw scraped content
	 *
	 * @throws {Error} If file reading fails or file doesn't exist
	 *
	 * @example
	 * const content = await scraper.loadRawContent(result);
	 * // Returns unprocessed content from raw file
	 */
	public async loadRawContent(result: PageResult): Promise<string> {
		return await fs.readFile(result.contentPath, "utf-8");
	}

	/**
	 * Returns an array of all URLs that have been processed during the current session.
	 *
	 * @public
	 * @returns {string[]} Array of processed URLs
	 *
	 * @example
	 * const urls = scraper.getProcessedUrls();
	 * // Returns ["https://example.com", "https://example.com/page", ...]
	 */
	public getProcessedUrls(): string[] {
		return Array.from(this.processedUrls);
	}

	/**
	 * Returns a new Map containing copies of all processing results from the current session.
	 *
	 * @public
	 * @returns {Map<string, PageResult>} Map of all processing results keyed by URL
	 *
	 * @example
	 * const results = scraper.getResults();
	 */
	public getResults(): Map<string, PageResult> {
		return new Map(this.results);
	}
}

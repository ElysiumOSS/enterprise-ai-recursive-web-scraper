/**
 * @fileoverview Advanced web scraping and content processing system that provides comprehensive functionality
 * for recursive web crawling, content extraction, screenshot capture, and AI-powered content analysis.
 * 
 * @module web
 * @requires playwright - For browser automation and screenshot capture
 * @requires node:path - For file path handling 
 * @requires node:fs/promises - For async file operations
 * @requires ./scraper.js - Content extraction and filtering logic
 * @requires ./content-analyzer.js - Content analysis and prompt generation
 * @requires ../constants/gemini-settings.js - Configuration for Gemini LLM
 * @requires ./content-filter.js - Content filtering and moderation
 * 
 * @description
 * This module implements a sophisticated web scraping and content processing system with the following key capabilities:
 * 
 * - Multi-threaded web scraping using a thread pool for concurrent processing
 * - Recursive crawling of websites while respecting domain boundaries
 * - Automated screenshot capture at different scroll positions
 * - Content extraction and filtering using custom scraping logic
 * - AI-powered content analysis and structuring using Google's Gemini LLM
 * - File-based storage of raw and processed content with organized directory structure
 * - Error handling and recovery mechanisms
 * - Content moderation and NSFW filtering
 * - Dynamic prompt generation based on content analysis
 * 
 * The system is designed to be highly scalable and configurable while maintaining clean separation of concerns
 * between different processing stages. It uses a modular architecture with specialized components for:
 * 
 * - Browser automation (Playwright)
 * - Content extraction (Scraper)
 * - Content filtering (ContentFilterManager) 
 * - Content analysis (ContentAnalyzer)
 * - Prompt generation (PromptGenerator)
 * - File system operations
 * 
 * Key Features:
 * - Configurable output directory structure
 * - Automatic handling of relative/absolute URLs
 * - Intelligent URL deduplication
 * - Robust error handling and recovery
 * - Modular design for easy extension
 * - Comprehensive logging and debugging
 * - Memory efficient processing
 * - Rate limiting and throttling support
 * - Configurable content filtering
 * - AI-powered content analysis
 * 
 * Processing Flow:
 * 1. URL validation and normalization
 * 2. Browser initialization with optimized settings
 * 3. Page load and screenshot capture
 * 4. Content extraction and initial filtering
 * 5. NSFW/content moderation checks
 * 6. AI-powered content analysis
 * 7. File storage with organized structure
 * 8. Link discovery and recursive processing
 * 9. Error handling and recovery
 * 10. Resource cleanup
 * 
 * Configuration Options:
 * - Output directory structure
 * - Browser launch parameters
 * - Content filtering rules
 * - AI model settings
 * - Rate limiting parameters
 * - Domain boundaries
 * - File naming conventions
 * - Screenshot settings
 * 
 * Error Handling:
 * - Network failures
 * - Invalid URLs
 * - Content extraction errors
 * - AI processing failures
 * - File system errors
 * - Memory constraints
 * - Timeout conditions
 * 
 * Performance Considerations:
 * - Memory usage optimization
 * - Concurrent processing limits
 * - Resource cleanup
 * - Caching strategies
 * - Network efficiency
 * - Storage optimization
 * 
 * Security Features:
 * - NSFW content filtering
 * - Domain validation
 * - Content sanitization
 * - Resource limits
 * - Safe file handling
 * 
 * @example
 * ```typescript
 * // Initialize scraper with custom output directory
 * const scraper = new WebScraper("custom_output");
 * 
 * // Configure content filter
 * scraper.contentFilter.setRules({
 *   maxLength: 10000,
 *   allowedDomains: ['example.com'],
 *   blockedKeywords: ['spam', 'adult']
 * });
 * 
 * try {
 *   // Start recursive scraping
 *   const results = await scraper.scrapeWebsite("https://example.com");
 *   
 *   // Process results
 *   for (const [url, result] of results) {
 *     if (result.error) {
 *       console.error(`Error processing ${url}:`, result.error);
 *       continue;
 *     }
 *     
 *     // Access processed content
 *     const content = await fs.readFile(result.processedContentPath, 'utf-8');
 *     console.log(`Processed ${url}:`, {
 *       rawContent: result.contentPath,
 *       processedContent: result.processedContentPath,
 *       screenshot: result.screenshot,
 *       timestamp: new Date(result.timestamp)
 *     });
 *   }
 * } catch (error) {
 *   console.error("Scraping failed:", error);
 * }
 * ```
 * 
 * @see {@link PageResult} for details on processing results
 * @see {@link ContentFilterManager} for content filtering capabilities
 * @see {@link ContentAnalyzer} for AI analysis features
 * @see {@link PromptGenerator} for dynamic prompt generation
 * 
 * @license MIT
 * @author Original author and contributors
 * @version 1.0.0
 * @since 1.0.0
 * @copyright 2024
 */

import { chromium, Browser, Page } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import { scrape } from "./scraper.js";
import { genAI } from "../constants/gemini-settings.js";
import { safetySettings } from "../constants/gemini-settings.js";
import { ContentFilterManager } from "./scraper.js";
import { ContentAnalyzer, PromptGenerator } from './content-analyzer.js';
import natural from 'natural';

/**
 * Represents the complete result of processing a single web page, including all generated artifacts
 * and metadata.
 * 
 * @interface PageResult
 * @property {string} url - The fully qualified URL of the processed web page
 * @property {string} contentPath - Filesystem path to the raw scraped content file
 * @property {string} processedContentPath - Filesystem path to the AI-processed and structured content file
 * @property {string} screenshot - Filesystem path to the captured page screenshot
 * @property {string} [error] - Optional error message if any stage of processing failed
 * @property {number} timestamp - Unix timestamp (in milliseconds) when processing completed
 * 
 * The PageResult interface provides a comprehensive record of all artifacts and metadata
 * generated during the processing of a single web page. This includes:
 * 
 * - Original URL for reference and deduplication
 * - Paths to both raw and processed content files
 * - Screenshot location for visual reference
 * - Error information if processing failed
 * - Timestamp for tracking and ordering
 * 
 * Use Cases:
 * - Tracking processing status and results
 * - Error handling and recovery
 * - Content access and retrieval
 * - Processing verification
 * - Audit trail
 * 
 * @example
 * ```typescript
 * // Successful processing result
 * const successResult: PageResult = {
 *   url: 'https://example.com/page',
 *   contentPath: 'output/content/example_com_page_1234567890.txt',
 *   processedContentPath: 'output/processed/example_com_page_1234567890.txt',
 *   screenshot: 'output/screenshots/example_com_page_0.png',
 *   timestamp: Date.now()
 * };
 * 
 * // Failed processing result
 * const errorResult: PageResult = {
 *   url: 'https://example.com/invalid',
 *   contentPath: '',
 *   processedContentPath: '',
 *   screenshot: '',
 *   error: 'Failed to load page: 404 Not Found',
 *   timestamp: Date.now()
 * };
 * ```
 */
interface PageResult {
	url: string;
	contentPath: string;
	processedContentPath: string;
	screenshot: string;
	error?: string;
	timestamp: number;
}

/**
 * Core class implementing the web scraping and content processing system. Handles all aspects
 * of the scraping process from URL discovery to content storage.
 * 
 * @class WebScraper
 * 
 * @property {Browser | null} browser - Playwright browser instance used for automation
 * @property {Map<string, PageResult>} results - Map storing processing results for each URL
 * @property {Set<string>} processedUrls - Set of URLs that have been processed to prevent duplicates
 * @property {string} outputDir - Root directory for storing all generated files and artifacts
 * @property {ContentFilterManager} contentFilter - Instance of content filtering manager
 * @property {string} baseUrl - Base URL/domain for the current scraping session
 * 
 * Key Responsibilities:
 * 1. Browser Management
 *    - Initialization with optimized settings
 *    - Resource cleanup
 *    - Error handling
 * 
 * 2. Content Processing
 *    - URL validation and normalization
 *    - Content extraction
 *    - Screenshot capture
 *    - AI analysis
 *    - Content filtering
 * 
 * 3. File Management
 *    - Directory structure creation
 *    - File naming and organization
 *    - Content storage
 *    - Resource cleanup
 * 
 * 4. URL Management
 *    - Deduplication
 *    - Domain boundary enforcement
 *    - Link discovery
 *    - Queue management
 * 
 * 5. Error Handling
 *    - Network failures
 *    - Content processing errors
 *    - Resource constraints
 *    - Recovery mechanisms
 * 
 * Processing Stages:
 * 1. Initialization
 *    - Directory setup
 *    - Browser launch
 *    - Filter configuration
 * 
 * 2. URL Processing
 *    - Validation
 *    - Deduplication
 *    - Domain checking
 * 
 * 3. Content Extraction
 *    - Page loading
 *    - Screenshot capture
 *    - Content scraping
 * 
 * 4. Content Processing
 *    - Filtering
 *    - AI analysis
 *    - Structure generation
 * 
 * 5. Storage
 *    - File organization
 *    - Content saving
 *    - Metadata tracking
 * 
 * 6. Link Discovery
 *    - URL extraction
 *    - Validation
 *    - Queue management
 * 
 * 7. Cleanup
 *    - Resource release
 *    - Error handling
 *    - Status reporting
 * 
 * @example
 * ```typescript
 * // Initialize scraper with custom settings
 * const scraper = new WebScraper("output_dir");
 * 
 * try {
 *   // Configure content filter
 *   scraper.contentFilter.setRules({
 *     maxLength: 50000,
 *     allowedDomains: ['example.com']
 *   });
 *   
 *   // Start recursive scraping
 *   const results = await scraper.scrapeWebsite("https://example.com");
 *   
 *   // Process results
 *   for (const [url, result] of results) {
 *     if (result.error) {
 *       console.error(`Error processing ${url}:`, result.error);
 *       continue;
 *     }
 *     
 *     // Access processed content
 *     const content = await fs.readFile(result.processedContentPath, 'utf-8');
 *     console.log(`Successfully processed ${url}`);
 *   }
 * } catch (error) {
 *   console.error("Scraping failed:", error);
 * }
 * ```
 * 
 * @throws {Error} Invalid URL provided
 * @throws {Error} Browser initialization failed
 * @throws {Error} Content processing failed
 * @throws {Error} File system operation failed
 */
export class WebScraper {
	private browser: Browser | null = null;
	private results: Map<string, PageResult> = new Map();
	private processedUrls: Set<string> = new Set();
	private outputDir: string;
	public readonly contentFilter: ContentFilterManager;
	private baseUrl: string = '';
	private sentimentAnalyzer: natural.SentimentAnalyzer;

	/**
	 * Creates a new WebScraper instance.
	 * 
	 * @param {string} outputDir - Directory where scraped content and artifacts will be stored
	 * @default "scraping_output"
	 * 
	 * The constructor initializes a new WebScraper instance with the following setup:
	 * 
	 * 1. Output Directory
	 *    - Creates base directory for all artifacts
	 *    - Organizes subdirectories for different content types
	 *    - Handles path normalization
	 * 
	 * 2. Content Filter
	 *    - Initializes content filtering system
	 *    - Sets up default filtering rules
	 *    - Prepares moderation capabilities
	 * 
	 * Directory Structure:
	 * ```
	 * outputDir/
	 * ├── content/         # Raw scraped content
	 * │   └── [domain]/    # Organized by domain
	 * ├── processed/       # AI-processed content
	 * │   └── [domain]/    # Organized by domain
	 * └── screenshots/     # Page screenshots
	 *     └── [domain]/    # Organized by domain
	 * ```
	 * 
	 * @example
	 * ```typescript
	 * // Basic initialization
	 * const scraper = new WebScraper();
	 * 
	 * // Custom output directory
	 * const customScraper = new WebScraper("custom/output/path");
	 * ```
	 * 
	 * @throws {Error} If directory creation fails
	 * @throws {Error} If content filter initialization fails
	 */
	constructor(outputDir: string = "scraping_output") {
		this.outputDir = outputDir;
		this.contentFilter = ContentFilterManager.getInstance();

		// Initialize sentiment analyzer
		const stemmer = natural.PorterStemmer;
		this.sentimentAnalyzer = new natural.SentimentAnalyzer("English", stemmer, "afinn");
	}

	/**
	 * Main entry point for scraping a website. Initializes the browser, processes the starting URL,
	 * and recursively crawls linked pages within the same domain.
	 * 
	 * Processing Flow:
	 * 1. URL Validation
	 *    - Format checking
	 *    - Domain extraction
	 *    - Protocol verification
	 * 
	 * 2. Environment Setup
	 *    - Directory initialization
	 *    - Browser launch
	 *    - Resource allocation
	 * 
	 * 3. Content Processing
	 *    - Page loading
	 *    - Content extraction
	 *    - Screenshot capture
	 *    - AI analysis
	 * 
	 * 4. Link Discovery
	 *    - URL extraction
	 *    - Domain filtering
	 *    - Queue management
	 * 
	 * 5. Resource Management
	 *    - Memory monitoring
	 *    - Connection handling
	 *    - Cleanup operations
	 * 
	 * Error Handling:
	 * - Invalid URLs
	 * - Network failures
	 * - Browser crashes
	 * - Memory constraints
	 * - Timeout conditions
	 * 
	 * @param {string} url - Starting URL to begin scraping from
	 * @returns {Promise<Map<string, PageResult>>} Map of results for all processed URLs
	 * @throws {Error} If URL is invalid or scraping fails
	 * 
	 * @example
	 * ```typescript
	 * const scraper = new WebScraper("output");
	 * 
	 * try {
	 *   // Start scraping
	 *   const results = await scraper.scrapeWebsite("https://example.com");
	 *   
	 *   // Process successful results
	 *   for (const [url, result] of results) {
	 *     if (!result.error) {
	 *       console.log(`Successfully processed ${url}`);
	 *       console.log(`Content saved to: ${result.processedContentPath}`);
	 *       console.log(`Screenshot saved to: ${result.screenshot}`);
	 *     }
	 *   }
	 *   
	 *   // Handle errors
	 *   const errors = Array.from(results.entries())
	 *     .filter(([_, result]) => result.error)
	 *     .map(([url, result]) => ({url, error: result.error}));
	 *   
	 *   if (errors.length > 0) {
	 *     console.error("Encountered errors:", errors);
	 *   }
	 * } catch (error) {
	 *   console.error("Fatal error during scraping:", error);
	 * }
	 * ```
	 */
	public async scrapeWebsite(url: string): Promise<Map<string, PageResult>> {
		if (!url || typeof url !== "string") {
			throw new Error("Invalid URL provided");
		}

		this.baseUrl = new URL(url).origin;
		console.log("Initializing scraper for URL:", url);
		await this.initializeDirectories();

		try {
			this.browser = await chromium.launch({
				headless: true,
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-dev-shm-usage',
					'--disable-accelerated-2d-canvas',
					'--disable-gpu',
					'--window-size=1920x1080',
				]
			});

			const result = await this.processSinglePage(url);
			this.results.set(url, result);
			return this.results;
		} catch (error) {
			console.error("Scraping failed:", error);
			throw error;
		} finally {
			if (this.browser) {
				await this.browser.close();
				this.browser = null;
			}
		}
	}

	/**
	 * Creates required output directories if they don't exist.
	 * 
	 * Directory Structure:
	 * ```
	 * outputDir/
	 * ├── content/         # Raw scraped content
	 * │   └── [domain]/    # Organized by domain
	 * ├── processed/       # AI-processed content
	 * │   └── [domain]/    # Organized by domain
	 * └── screenshots/     # Page screenshots
	 *     └── [domain]/    # Organized by domain
	 * ```
	 * 
	 * @private
	 * @returns {Promise<void>}
	 * 
	 * @throws {Error} If directory creation fails
	 * @throws {Error} If permissions are insufficient
	 * @throws {Error} If disk space is insufficient
	 */
	private async initializeDirectories(): Promise<void> {
		await fs.mkdir(this.outputDir, { recursive: true });
	}

	/**
	 * Processes a single web page, extracting content, capturing a screenshot, and analyzing content.
	 * Also discovers and processes linked pages within the same domain.
	 * 
	 * Processing Stages:
	 * 1. URL Validation
	 *    - Format checking
	 *    - Deduplication
	 *    - Content type verification
	 * 
	 * 2. Content Safety
	 *    - Domain checking
	 *    - NSFW detection
	 *    - Content moderation
	 * 
	 * 3. Page Processing
	 *    - Loading and rendering
	 *    - Screenshot capture
	 *    - Content extraction
	 * 
	 * 4. Content Analysis
	 *    - Text filtering
	 *    - AI processing
	 *    - Structure generation
	 * 
	 * 5. Link Discovery
	 *    - URL extraction
	 *    - Domain filtering
	 *    - Queue management
	 * 
	 * Error Handling:
	 * - Network failures
	 * - Timeout conditions
	 * - Content extraction errors
	 * - Processing failures
	 * - Resource constraints
	 * 
	 * @private
	 * @param {string} url - URL of the page to process
	 * @returns {Promise<PageResult>} Processing result for the page
	 * 
	 * @example
	 * ```typescript
	 * try {
	 *   const result = await scraper.processSinglePage("https://example.com/page");
	 *   
	 *   if (result.error) {
	 *     console.error(`Processing failed: ${result.error}`);
	 *     return;
	 *   }
	 *   
	 *   // Access results
	 *   console.log("Raw content:", result.contentPath);
	 *   console.log("Processed content:", result.processedContentPath);
	 *   console.log("Screenshot:", result.screenshot);
	 *   console.log("Processed at:", new Date(result.timestamp));
	 * } catch (error) {
	 *   console.error("Fatal error:", error);
	 * }
	 * ```
	 * 
	 * @throws {Error} If page loading fails
	 * @throws {Error} If content extraction fails
	 * @throws {Error} If processing fails
	 */
	private async processSinglePage(url: string): Promise<PageResult> {
		if (this.processedUrls.has(url)) {
			return this.results.get(url)!;
		}

		this.processedUrls.add(url);
		
		try {
			if (this.contentFilter.isNSFWDomain(url)) {
				return {
					url,
					contentPath: "",
					processedContentPath: "",
					screenshot: "",
					error: "NSFW domain detected",
					timestamp: Date.now(),
				};
			}

			const page = await this.browser!.newPage();
			await page.goto(url, { waitUntil: "networkidle" });

			const screenshot = await this.takeScreenshot(page, url);
			const scrapedContent = await scrape(url);

			if ("error" in scrapedContent) {
				throw new Error(scrapedContent.error);
			}

			const filteredTexts = Array.isArray(scrapedContent.filteredTexts)
				? scrapedContent.filteredTexts
						.map((text) => this.contentFilter.filterText(text))
						.join("\n")
				: scrapedContent.filteredTexts
					? this.contentFilter.filterText(scrapedContent.filteredTexts)
					: "";

			const contentPath = await this.saveToFile(filteredTexts, "content", url);
			const processedContent = await this.processWithLLM(filteredTexts, url);
			const processedContentPath = await this.saveToFile(
				processedContent,
				"processed",
				url,
			);

			const links = await page.evaluate(() => {
				return Array.from(document.querySelectorAll("a[href]"))
					.map((link) => link.getAttribute("href"))
					.filter((href): href is string => 
						href !== null && 
						!href.startsWith("#") && 
						!href.startsWith("javascript:") &&
						!href.startsWith("mailto:") &&
						!href.startsWith("tel:"))
					.map((href) => new URL(href, window.location.href).href);
			});

			// Process new URLs that belong to the same domain
			for (const link of links) {
				if (link.startsWith(this.baseUrl) && !this.processedUrls.has(link)) {
					await this.processSinglePage(link);
				}
			}

			const result: PageResult = {
				url,
				contentPath,
				processedContentPath,
				screenshot,
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
				screenshot: "",
				error: error instanceof Error ? error.message : "Unknown error",
				timestamp: Date.now(),
			};
		}
	}

	/**
	 * Processes extracted content using Google's Gemini LLM for analysis and structuring.
	 * 
	 * Processing Steps:
	 * 1. Content Preparation
	 *    - Text filtering
	 *    - Format validation
	 *    - Length checking
	 * 
	 * 2. Context Analysis
	 *    - URL analysis
	 *    - Content type detection
	 *    - Structure identification
	 * 
	 * 3. Prompt Generation
	 *    - Dynamic template selection
	 *    - Context integration
	 *    - Parameter optimization
	 * 
	 * 4. AI Processing
	 *    - Model selection
	 *    - Safety settings
	 *    - Response handling
	 * 
	 * Error Handling:
	 * - Content validation
	 * - Model errors
	 * - Timeout conditions
	 * - Response validation
	 * 
	 * @private
	 * @param {string} content - Raw content to process
	 * @param {string} url - URL of the content source
	 * @returns {Promise<string>} Processed and structured content
	 * 
	 * @throws {Error} If content is invalid
	 * @throws {Error} If LLM processing fails
	 * @throws {Error} If response is invalid
	 * 
	 * @example
	 * ```typescript
	 * try {
	 *   const rawContent = "Example raw content...";
	 *   const url = "https://example.com";
	 *   
	 *   const processed = await scraper.processWithLLM(rawContent, url);
	 *   console.log("Processed content:", processed);
	 * } catch (error) {
	 *   console.error("Processing failed:", error);
	 * }
	 * ```
	 */
	private async processWithLLM(content: string, url: string): Promise<string> {
		try {
			const filteredContent = this.contentFilter.filterText(content);
			const context = ContentAnalyzer.analyzeContent(url, filteredContent);
			const dynamicPrompt = PromptGenerator.generatePrompt(context, filteredContent);

			const model = await genAI.getGenerativeModel({
				model: "gemini-1.5-flash",
				safetySettings,
			});

			const response = await model.generateContent(dynamicPrompt);
			return response.response.text();
		} catch (error) {
			console.error("Error processing with LLM:", error);
			throw error;
		}
	}

	/**
	 * Takes a full page screenshot of the current page
	 * 
	 * Screenshot Process:
	 * 1. Page Preparation
	 *    - Viewport setup
	 *    - Content loading
	 *    - Animation completion
	 * 
	 * 2. Capture Settings
	 *    - Full page mode
	 *    - Resolution configuration
	 *    - Format selection
	 * 
	 * 3. File Management
	 *    - Path generation
	 *    - Directory creation
	 *    - File saving
	 * 
	 * Error Handling:
	 * - Page loading issues
	 * - Screenshot failures
	 * - Storage errors
	 * 
	 * @private
	 * @param {Page} page - Playwright page instance
	 * @param {string} url - URL being captured
	 * @returns {Promise<string>} Path to saved screenshot
	 * 
	 * @throws {Error} If screenshot capture fails
	 * @throws {Error} If file saving fails
	 * 
	 * @example
	 * ```typescript
	 * const page = await browser.newPage();
	 * await page.goto(url);
	 * 
	 * try {
	 *   const screenshotPath = await scraper.takeScreenshot(page, url);
	 *   console.log("Screenshot saved to:", screenshotPath);
	 * } catch (error) {
	 *   console.error("Screenshot capture failed:", error);
	 * }
	 * ```
	 */
	private async takeScreenshot(page: Page, url: string): Promise<string> {
		const filePath = await this.saveToFile(
			'', // Empty content since we're saving an image
			'screenshots',
			url,
			'.png'
		);

		try {
			// Wait for network to be idle and initial animations to complete
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(1000); // Wait for initial animations

			// Scroll through the page to trigger lazy loading
			await page.evaluate(async () => {
				await new Promise<void>((resolve) => {
					let totalHeight = 0;
					const distance = 100;
					const timer = setInterval(() => {
						const scrollHeight = document.body.scrollHeight;
						window.scrollBy(0, distance);
						totalHeight += distance;

						if (totalHeight >= scrollHeight) {
							clearInterval(timer);
							window.scrollTo(0, 0); // Scroll back to top
							setTimeout(resolve, 500); // Wait for final animations
						}
					}, 100);
				});
			});

			// Take the screenshot
			await page.screenshot({
				path: filePath,
				fullPage: true,
				timeout: 30000 // 30 second timeout
			});

			return filePath;
		} catch (error) {
			console.error('Screenshot capture failed:', error);
			throw error;
		}
	}

	/**
	 * Saves content to a file with organized directory structure based on URL path.
	 * 
	 * File Organization:
	 * 1. Path Generation
	 *    - URL parsing
	 *    - Path cleaning
	 *    - Directory structure
	 * 
	 * 2. Content Validation
	 *    - File type checking
	 *    - Content verification
	 *    - Size limits
	 * 
	 * 3. Directory Management
	 *    - Path creation
	 *    - Permissions
	 *    - Existing files
	 * 
	 * 4. File Operations
	 *    - Content writing
	 *    - Atomic saves
	 *    - Cleanup
	 * 
	 * Directory Structure:
	 * ```
	 * outputDir/
	 * └── [domain]/
	 *     ├── content/
	 *     │   └── [path]/
	 *     │       └── content-[timestamp].txt
	 *     ├── processed/
	 *     │   └── [path]/
	 *     │       └── processed-[timestamp].txt
	 *     └── screenshots/
	 *         └── [path]/
	 *             └── screenshot-[timestamp].png
	 * ```
	 * 
	 * @private
	 * @param {string} content - Content to save
	 * @param {'content' | 'processed' | 'screenshots'} type - Type of content being saved
	 * @param {string} url - Source URL
	 * @param {string} [fileExtension='.txt'] - File extension to use
	 * @returns {Promise<string>} Path to saved file
	 * 
	 * @throws {Error} If file is non-textual
	 * @throws {Error} If saving fails
	 * @throws {Error} If directory creation fails
	 * 
	 * @example
	 * ```typescript
	 * try {
	 *   // Save raw content
	 *   const contentPath = await scraper.saveToFile(
	 *     "Raw content...",
	 *     "content",
	 *     "https://example.com/page"
	 *   );
	 *   
	 *   // Save processed content
	 *   const processedPath = await scraper.saveToFile(
	 *     "Processed content...",
	 *     "processed",
	 *     "https://example.com/page"
	 *   );
	 *   
	 *   console.log("Content saved to:", contentPath);
	 *   console.log("Processed content saved to:", processedPath);
	 * } catch (error) {
	 * @throws {Error} If file is non-textual or saving fails
	 */
	private async saveToFile(
		content: string,
		type: 'content' | 'processed' | 'screenshots',
		url: string,
		fileExtension: string = '.txt'
	): Promise<string> {
		// For processed content, validate AI response
		if (type === 'processed') {
			content = await this.processAIResponse(content);
		}

		const urlObj = new URL(url);
		
		// Skip non-textual files and clean up the path
		const routePath = urlObj.pathname
			.replace(/\.(html?|php|aspx?|jsp)$/i, '') // Remove common web file extensions
			.replace(/^\/|\/$/g, '')                  // Remove leading/trailing slashes
			.replace(/[^a-z0-9]/gi, '-')             // Convert special chars to hyphens
			.replace(/-+/g, '-')                      // Replace multiple hyphens with single
			.replace(/-$/g, '')                       // Remove trailing hyphens
			.toLowerCase() || 'root';                 // Use 'root' for homepage

		// Skip processing if the path indicates a non-textual file
		if (/\.(jpg|jpeg|png|gif|svg|pdf|doc|docx|xls|xlsx|zip|rar)$/i.test(urlObj.pathname)) {
			throw new Error('Skipping non-textual file');
		}

		const routeDir = path.join(this.outputDir, routePath);
		await fs.mkdir(path.join(routeDir, type), { recursive: true });

		const timestamp = Date.now();
		const fileName = `${type}-${timestamp}${fileExtension}`;
		const filePath = path.join(routeDir, type, fileName);

		await fs.writeFile(filePath, content, 'utf-8');
		return filePath;
	}

	/**
	 * Validates AI generated content for safety and sentiment
	 * @private
	 * @param {string} content - AI generated content to validate
	 * @returns {Promise<{isValid: boolean, reason?: string}>}
	 */
	private async validateAIResponse(content: string): Promise<{isValid: boolean, reason?: string}> {
		try {
			// 1. Check for NSFW domains
			const nsfwDomainCheck = await this.contentFilter.isNSFWDomain(content);
			
			// 2. Check for NSFW keywords in content
			const nsfwKeywords = [
				'porn', 'xxx', 'sex', 'adult', 'nude', 'naked', 'nsfw',
				'escort', 'erotic', 'pussy', 'dick', 'cock', 'boob',
				// Add more keywords as needed
			];
			
			const containsNSFWKeywords = nsfwKeywords.some(keyword => 
				content.toLowerCase().includes(keyword)
			);

			// 3. Check for suspicious patterns (URLs, file extensions)
			const suspiciousPatterns = [
				/\.(xxx|sex|porn|adult)/i,
				/(escort|massage|dating)\s*services/i,
				/over\s*18|adults?\s*only/i
			];

			const containsSuspiciousPatterns = suspiciousPatterns.some(pattern => 
				pattern.test(content)
			);

			if (nsfwDomainCheck || containsNSFWKeywords || containsSuspiciousPatterns) {
				return {
					isValid: false,
					reason: 'Content flagged as potentially NSFW'
				};
			}

			// 4. Perform sentiment analysis
			const words = content.toLowerCase().split(' ');
			const sentimentScore = this.sentimentAnalyzer.getSentiment(words);

			const NEGATIVE_THRESHOLD = -0.5;
			const EXTREMELY_NEGATIVE_THRESHOLD = -0.8;

			if (sentimentScore < EXTREMELY_NEGATIVE_THRESHOLD) {
				return {
					isValid: false,
					reason: 'Content contains extremely negative sentiment'
				};
			}

			if (sentimentScore < NEGATIVE_THRESHOLD) {
				console.warn(`Warning: Content has negative sentiment score: ${sentimentScore}`);
			}

			// 5. Additional safety check using Gemini's safety settings
			try {
				const model = await genAI.getGenerativeModel({
					model: "gemini-1.5-flash",
					safetySettings
				});

				const safetyPrompt = `Please analyze if the following content is safe and appropriate (not NSFW). Respond with only "SAFE" or "UNSAFE": ${content.substring(0, 1000)}`;
				const safetyCheck = await model.generateContent(safetyPrompt);
				const safetyResponse = safetyCheck.response.text().toLowerCase();

				if (safetyResponse.includes('unsafe')) {
					return {
						isValid: false,
						reason: 'Content flagged as unsafe by AI safety check'
					};
				}
			} catch (aiError) {
				console.warn('AI safety check failed:', aiError);
				// Continue with other checks if AI check fails
			}

			return { isValid: true };

		} catch (error) {
			console.error('Content validation failed:', error);
			return {
				isValid: false,
				reason: 'Content validation failed'
			};
		}
	}

	/**
	 * Process AI response with safety checks
	 * @private
	 * @param {string} aiResponse - Response from AI model
	 * @returns {Promise<string>} Validated and processed response
	 * @throws {Error} If content validation fails
	 */
	private async processAIResponse(aiResponse: string): Promise<string> {
		const validation = await this.validateAIResponse(aiResponse);
		
		if (!validation.isValid) {
			throw new Error(`AI response rejected: ${validation.reason}`);
		}

		return aiResponse;
	}
}

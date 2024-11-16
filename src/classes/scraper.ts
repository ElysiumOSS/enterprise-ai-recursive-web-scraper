/**
 * @fileoverview Enhanced web scraping and content filtering functions for detecting and filtering inappropriate content
 * @file scraper.ts
 * @module scraper
 * @description This module provides functionality for web scraping with content filtering capabilities.
 * It includes classes for managing browser operations, text processing, and content filtering using
 * Trie data structures. The module is designed to detect and filter NSFW content, slurs, and other
 * inappropriate content from web pages.
 */

import puppeteer from "puppeteer-extra";
import type { PuppeteerLaunchOptions, Browser, Page } from "puppeteer";
import { PuppeteerExtra } from "puppeteer-extra";
import { PuppeteerExtraPluginAdblocker } from "puppeteer-extra-plugin-adblocker";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { nsfw, nsfwNames, slurs } from "../data/index.js";
import { TrieNode } from "./types.js";

const puppeteerExtra = puppeteer as unknown as PuppeteerExtra;

puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(
	new PuppeteerExtraPluginAdblocker({
		blockTrackers: true,
		useCache: true,
		blockTrackersAndAnnoyances: true,
	}),
);

/**
 * Class representing a Trie data structure for efficient content filtering.
 * @class
 * @description Implements a Trie data structure optimized for string matching and filtering.
 * The Trie allows for fast prefix-based searching and efficient storage of large word lists.
 */
class ContentTrie {
	/** @private Root node of the Trie */
	private root: TrieNode = this.createNode();

	/**
	 * Creates a new Trie node with empty children map and end-of-word flag.
	 * @private
	 * @returns {TrieNode} A new initialized Trie node
	 */
	private createNode(): TrieNode {
		return {
			children: {},
			isEndOfWord: false,
		};
	}

	/**
	 * Inserts a word into the Trie structure.
	 * @param {string} word - The word to insert into the Trie
	 * @description Converts the word to lowercase and creates a path in the Trie,
	 * marking the last node as an end of word.
	 */
	public insert(word: string): void {
		let node = this.root;
		for (const char of word.toLowerCase()) {
			if (!node.children[char]) {
				node.children[char] = this.createNode();
			}
			node = node.children[char];
		}
		node.isEndOfWord = true;
	}

	/**
	 * Searches for a complete word in the Trie.
	 * @param {string} word - The word to search for
	 * @returns {boolean} True if the exact word exists in the Trie, false otherwise
	 * @description Performs a case-insensitive search through the Trie to find an exact match
	 */
	public search(word: string): boolean {
		let node = this.root;
		for (const char of word.toLowerCase()) {
			if (!node.children[char]) {
				return false;
			}
			node = node.children[char];
		}
		return node.isEndOfWord;
	}

	/**
	 * Inserts multiple words into the Trie simultaneously.
	 * @param {string[]} words - Array of words to insert
	 * @description Efficiently inserts multiple words into the Trie structure
	 */
	public bulkInsert(words: string[]): void {
		words.forEach((word) => this.insert(word));
	}
}

/**
 * Singleton class managing content filtering operations.
 * @class
 * @description Provides centralized content filtering functionality using multiple
 * filtering mechanisms including Tries and Sets. Implements the Singleton pattern
 * to ensure consistent filtering across the application.
 */
class ContentFilterManager {
	/** @private Singleton instance */
	private static instance: ContentFilterManager;
	/** @private Trie for storing and matching filtered words */
	private filterTrie: ContentTrie;
	/** @private Set of NSFW domains */
	private nsfwDomains: Set<string>;
	/** @private Trie for storing and matching NSFW terms */
	private nsfwNamesTrie: ContentTrie;
	/** @private Set of filtered dictionary words */
	private filterDict: Set<string>;

	/**
	 * Private constructor to prevent direct instantiation.
	 * @private
	 * @description Initializes all filtering data structures and loads initial data
	 */
	private constructor() {
		this.filterTrie = new ContentTrie();
		this.nsfwNamesTrie = new ContentTrie();
		this.nsfwDomains = new Set(Object.keys(nsfw));
		this.filterDict = new Set(Object.keys(slurs));

		this.filterTrie.bulkInsert(Object.keys(slurs));
		this.nsfwNamesTrie.bulkInsert(Object.keys(nsfwNames));
	}

	/**
	 * Gets or creates the singleton instance of ContentFilterManager.
	 * @returns {ContentFilterManager} The singleton instance
	 * @description Ensures only one instance of ContentFilterManager exists
	 */
	public static getInstance(): ContentFilterManager {
		if (!ContentFilterManager.instance) {
			ContentFilterManager.instance = new ContentFilterManager();
		}
		return ContentFilterManager.instance;
	}

	/**
	 * Checks if a URL contains or belongs to an NSFW domain.
	 * @param {string} url - The URL to check
	 * @returns {boolean} True if the URL matches any NSFW domain patterns
	 * @description Performs case-sensitive matching against known NSFW domains
	 */
	public isNSFWDomain(url: string): boolean {
		return Array.from(this.nsfwDomains).some((domain) => url.includes(domain));
	}

	/**
	 * Filters text by replacing inappropriate words with a replacement string.
	 * @param {string} text - The text to filter
	 * @param {string} [replacement="***"] - The string to replace filtered words with
	 * @returns {string} The filtered text with inappropriate words replaced
	 * @description Performs word-by-word filtering using both Trie and Set-based matching
	 */
	public filterText(text: string, replacement: string = "***"): string {
		if (!text) {
			return text;
		}

		return text
			.split(/\s+/)
			.map((word) =>
				this.filterDict.has(word.toLowerCase()) ||
				this.filterTrie.search(word.toLowerCase())
					? replacement
					: word,
			)
			.join(" ");
	}
}

/**
 * Utility class for processing and cleaning text content.
 * @class
 * @description Provides static methods for text cleaning, normalization,
 * and duplicate removal operations.
 */
class TextProcessor {
	/** @private Regular expression for matching emoji characters */
	private static readonly EMOJI_PATTERN = /[\u{1F600}-\u{1F64F}]/gu;
	/** @private Regular expression for matching non-ASCII characters */
	private static readonly NON_ASCII_PATTERN = /[^\x00-\x7F]/g;
	/** @private Regular expression for matching multiple whitespace characters */
	private static readonly WHITESPACE_PATTERN = /\s+/g;
	/** @private Regular expression for matching newline characters */
	private static readonly NEWLINE_PATTERN = /[\n\r]+/g;

	/**
	 * Cleans and normalizes text content.
	 * @param {string} text - The text to clean
	 * @returns {string} The cleaned and normalized text
	 * @description Removes emojis, non-ASCII characters, normalizes whitespace,
	 * and converts multiple newlines to single spaces
	 */
	public static cleanText(text: string): string {
		return text
			.trim()
			.replace(this.EMOJI_PATTERN, "")
			.replace(this.NON_ASCII_PATTERN, "")
			.replace(this.WHITESPACE_PATTERN, " ")
			.replace(this.NEWLINE_PATTERN, " ");
	}

	/**
	 * Removes duplicate text segments from content.
	 * @param {string} text - The text to process
	 * @returns {string} Text with duplicate segments removed
	 * @description Splits text into segments at sentence boundaries and removes duplicates
	 */
	public static removeDuplicateSegments(text: string): string {
		const segments = text.match(/[^.!?]+[.!?]+/g) || [text];
		return Array.from(new Set(segments)).join(" ");
	}
}

/**
 * Class managing browser operations for web scraping.
 * @class
 * @description Provides static methods for browser management, page creation,
 * and content extraction operations.
 */
class BrowserManager {
	/**
	 * Creates and configures a new browser page.
	 * @param {Browser} browser - The browser instance to create the page in
	 * @returns {Promise<Page>} A configured page instance
	 * @description Creates a new page with request interception enabled and
	 * configured to block unnecessary resource types
	 */
	public static async createPage(browser: Browser): Promise<Page> {
		const page = await browser.newPage();
		await page.setRequestInterception(true);

		page.on("request", (request) => {
			if (
				["image", "stylesheet", "font", "media"].includes(
					request.resourceType(),
				)
			) {
				request.abort();
			} else {
				request.continue();
			}
		});

		return page;
	}

	/**
	 * Launches a new browser instance with stealth and blocking capabilities.
	 * @returns {Promise<Browser>} A configured browser instance
	 * @description Launches a headless browser with security and performance optimizations
	 */
	public static async launch(): Promise<Browser> {
		return await puppeteerExtra.launch({
			headless: true,
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-dev-shm-usage",
				"--disable-gpu",
				"--disable-web-security",
			],
			timeout: 0,
		} as PuppeteerLaunchOptions);
	}

	/**
	 * Extracts text content from a webpage.
	 * @param {Page} page - The page to extract content from
	 * @returns {Promise<string[]>} Array of extracted text content
	 * @description Extracts text from common content elements while filtering empty content
	 */
	public static async extractPageContent(page: Page): Promise<string[]> {
		return await page.evaluate(() => {
			const elements = Array.from(
				document.querySelectorAll(
					"p, div, span, a, h1, h2, h3, h4, h5, h6, li",
				),
			);
			return elements
				.map((el) => el.textContent?.trim() || "")
				.filter((text) => text.length > 0);
		});
	}
}

/**
 * Main scraping function that processes and filters web content.
 * @param {string} url - The URL to scrape
 * @returns {Promise<{flaggedDomain: boolean, containsCensored: boolean, filteredTexts: string[]} | {error: string}>}
 * Object containing scraping results or error information
 * @description Coordinates the entire scraping process including:
 * - URL validation
 * - Browser management
 * - Content extraction
 * - Text processing
 * - Content filtering
 * @throws {Error} Various errors related to browser operations or content processing
 */
export async function scrape(url: string): Promise<
	| {
			flaggedDomain: boolean;
			containsCensored: boolean;
			filteredTexts: string[];
	  }
	| { error: string }
> {
	let browser: Browser | null = null;
	let page: Page | null = null;

	try {
		if (!url || typeof url !== "string") {
			throw new Error("Invalid URL provided");
		}

		const filterManager = ContentFilterManager.getInstance();

		if (filterManager.isNSFWDomain(url)) {
			return { error: "Domain contains NSFW content" };
		}

		browser = await BrowserManager.launch().catch((err) => {
			throw new Error(`Failed to launch browser: ${err.message}`);
		});

		page = await BrowserManager.createPage(browser).catch((err) => {
			throw new Error(`Failed to create page: ${err.message}`);
		});

		try {
			await Promise.race([
				page.goto(url, { waitUntil: "domcontentloaded" }),
				new Promise((_, reject) =>
					setTimeout(
						() => reject(new Error("Navigation timeout after 30 seconds")),
						30000,
					),
				),
			]);
		} catch (navigationError) {
			throw new Error(
				`Failed to navigate to ${url}: ${
					navigationError instanceof Error
						? navigationError.message
						: navigationError
				}`,
			);
		}

		const finalUrl = page.url();
		if (filterManager.isNSFWDomain(finalUrl)) {
			return { error: "NSFW domain detected after redirect" };
		}

		const rawTexts = await BrowserManager.extractPageContent(page).catch(
			(err) => {
				throw new Error(`Failed to extract page content: ${err.message}`);
			},
		);

		try {
			const processedTexts = rawTexts.map((text) => {
				const cleaned = TextProcessor.cleanText(text);
				return TextProcessor.removeDuplicateSegments(cleaned);
			});

			const uniqueTexts = Array.from(new Set(processedTexts));
			const filteredTexts = uniqueTexts.map((text) =>
				filterManager.filterText(text),
			);

			const containsCensored = filteredTexts.some((text) =>
				text.includes("***"),
			);

			return {
				flaggedDomain: false,
				containsCensored,
				filteredTexts,
			};
		} catch (processingError) {
			throw new Error(
				`Failed to process text content: ${
					processingError instanceof Error
						? processingError.message
						: processingError
				}`,
			);
		}
	} catch (error) {
		console.error(`Scraping error:`, {
			url,
			error: error instanceof Error ? error.stack : error,
			timestamp: new Date().toISOString(),
		});

		return {
			error:
				error instanceof Error
					? `Scraping failed: ${error.message}`
					: "Scraping failed: Unknown error occurred",
		};
	} finally {
		try {
			if (page) {
				await page.close().catch(() => {});
			}
			if (browser) {
				await browser.close().catch(() => {});
			}
		} catch (cleanupError) {
			console.error("Error during cleanup:", cleanupError);
		}
	}
}

/**
 * Initializes the content filtering system.
 * @description Creates the singleton instance of ContentFilterManager and
 * loads all filtering data structures
 */
export const initializeFilterWords = (): void => {
	ContentFilterManager.getInstance();
};

/**
 * Filters text content using the ContentFilterManager.
 * @param {string} text - The text to filter
 * @param {string} [replace="***"] - The replacement string for filtered content
 * @returns {string} The filtered text with inappropriate content replaced
 * @description Provides a convenient wrapper around ContentFilterManager's filterText method
 */
export const filterText = (text: string, replace: string = "***"): string => {
	return ContentFilterManager.getInstance().filterText(text, replace);
};

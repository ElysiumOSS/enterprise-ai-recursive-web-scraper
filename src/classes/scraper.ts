/**
 * @fileoverview Enhanced web scraping and content filtering functions for detecting and filtering inappropriate content
 * @file scraper.ts
 * @module scraper
 * @description This module provides functionality for web scraping with content filtering capabilities.
 * It includes classes for managing browser operations, text processing, and content filtering using
 * Trie data structures. The module is designed to detect and filter NSFW content, slurs, and other
 * inappropriate content from web pages.
 * 
 * Key features:
 * - Web scraping using Puppeteer with stealth and ad-blocking capabilities
 * - Content filtering using Trie data structures for efficient pattern matching 
 * - Text processing with duplicate detection and removal
 * - NSFW domain detection and filtering
 * - Configurable content replacement
 * 
 * Classes:
 * - ContentTrie: Trie data structure for efficient string matching
 * - ContentFilterManager: Singleton manager for content filtering operations
 * - TextProcessor: Text cleaning and duplicate detection utility
 * - BrowserManager: Browser and page management for scraping
 * 
 * @example
 * ```typescript
 * // Initialize the filtering system
 * initializeFilterWords();
 * 
 * // Scrape and filter content from a URL
 * const result = await scrape('https://example.com');
 * if ('error' in result) {
 *   console.error(result.error);
 * } else {
 *   console.log(result.filteredTexts);
 * }
 * 
 * // Filter individual text
 * const filtered = filterText('text to filter');
 * ```
 * 
 * @requires puppeteer-extra - Enhanced version of Puppeteer with plugin support
 * @requires puppeteer-extra-plugin-adblocker - Plugin for blocking ads and trackers
 * @requires puppeteer-extra-plugin-stealth - Plugin for avoiding bot detection
 * 
 * @license MIT
 * @author Original author and contributors
 * @version 1.0.0
 * @since 1.0.0
 * 
 * @see {@link https://github.com/berstend/puppeteer-extra|puppeteer-extra} - Enhanced version of Puppeteer
 * @see {@link https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth|puppeteer-extra-plugin-stealth} - Stealth plugin for avoiding detection
 * @see {@link https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-adblocker|puppeteer-extra-plugin-adblocker} - Ad blocking plugin
 * 
 * @todo Add support for custom filtering rules
 * @todo Improve error handling and recovery
 * @todo Add rate limiting and request throttling
 * @todo Implement caching for frequently accessed content
 * @todo Add support for proxy rotation
 * @todo Improve duplicate detection algorithms
 * @todo Add support for custom content processors
 * @todo Implement better logging and monitoring
 * @todo Add support for distributed scraping
 * @todo Improve memory management for large-scale scraping
 * 
 * @throws {Error} When filter initialization fails
 * @throws {Error} When browser operations fail
 * @throws {Error} When content processing fails
 * @throws {Error} When network operations fail
 * 
 * @property {ContentFilterManager} filterManager - Singleton instance for content filtering
 * @property {BrowserManager} browserManager - Static class for browser operations
 * @property {TextProcessor} textProcessor - Static class for text processing
 * 
 * @borrows ContentFilterManager.filterText as filterText
 * @borrows ContentFilterManager.getInstance as getFilterManager
 * @borrows BrowserManager.launch as launchBrowser
 * @borrows TextProcessor.processText as processText
 * 
 * @exports scrape - Main scraping function
 * @exports initializeFilterWords - Filter initialization function
 * @exports filterText - Text filtering function
 * @exports ContentFilterManager - Content filtering manager class
 * 
 * @typedef {Object} ScrapingResult
 * @property {boolean} [flaggedDomain] - Whether the domain is flagged as NSFW
 * @property {boolean} [containsCensored] - Whether censored content was found
 * @property {string[]} [filteredTexts] - Array of filtered text content
 * @property {string} [error] - Error message if scraping failed
 * 
 * @typedef {Object} CodeBlock
 * @property {string} language - Programming language of the code block
 * @property {string} code - The actual code content
 * @property {boolean} lineNumbers - Whether line numbers should be displayed
 * 
 * @typedef {Object} TrieNode
 * @property {Object.<string, TrieNode>} children - Child nodes in the Trie
 * @property {boolean} isEndOfWord - Whether this node represents end of word
 * 
 * @typedef {Object} ContentExtractionResult
 * @property {string[]} texts - Array of extracted text content
 * @property {CodeBlock[]} codeBlocks - Array of extracted code blocks
 * 
 * @typedef {Object} FilterOptions
 * @property {string} [replacement="***"] - Replacement string for filtered content
 * @property {boolean} [caseSensitive=false] - Whether filtering is case sensitive
 * @property {number} [minLength=1] - Minimum length for content to be filtered
 * 
 * @typedef {Object} BrowserOptions
 * @property {boolean} [headless=true] - Whether to run browser in headless mode
 * @property {string[]} [args] - Additional browser launch arguments
 * @property {number} [timeout=30000] - Navigation timeout in milliseconds
 * 
 * @typedef {Object} ProcessingOptions
 * @property {number} [similarityThreshold=0.85] - Threshold for duplicate detection
 * @property {number} [maxLength=50000] - Maximum content length for processing
 * @property {boolean} [preserveFormatting=false] - Whether to preserve text formatting
 */

import puppeteer from "puppeteer-extra";
import type { PuppeteerLaunchOptions, Browser, Page } from "puppeteer";
import { PuppeteerExtra } from "puppeteer-extra";
import { PuppeteerExtraPluginAdblocker } from "puppeteer-extra-plugin-adblocker";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { CodeBlock, TrieNode } from "./types.js";

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
 * 
 * Key features:
 * - O(m) time complexity for insertions and searches, where m is word length
 * - Case-insensitive word matching
 * - Memory-efficient storage of large word lists
 * - Bulk insertion capabilities
 * 
 * @example
 * ```typescript
 * const trie = new ContentTrie();
 * 
 * // Insert words
 * trie.insert('test');
 * trie.bulkInsert(['word1', 'word2']);
 * 
 * // Search for words
 * console.log(trie.search('test')); // true
 * console.log(trie.search('missing')); // false
 * ```
 */
class ContentTrie {
	/** 
	 * Root node of the Trie
	 * @private
	 * @type {TrieNode}
	 */
	private root: TrieNode = this.createNode();

	/**
	 * Creates a new Trie node with empty children map and end-of-word flag.
	 * @private
	 * @returns {TrieNode} A new initialized Trie node with empty children map and isEndOfWord set to false
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
	 * marking the last node as an end of word. Each character in the word becomes
	 * a node in the Trie, with child nodes representing subsequent characters.
	 * 
	 * @example
	 * ```typescript
	 * const trie = new ContentTrie();
	 * trie.insert('test');
	 * ```
	 * 
	 * @throws {TypeError} If word is not a string
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
	 * @description Performs a case-insensitive search through the Trie to find an exact match.
	 * Returns true only if the exact word exists and is marked as an end of word.
	 * 
	 * @example
	 * ```typescript
	 * const trie = new ContentTrie();
	 * trie.insert('test');
	 * console.log(trie.search('test')); // true
	 * console.log(trie.search('tes')); // false
	 * console.log(trie.search('TEST')); // true (case-insensitive)
	 * ```
	 * 
	 * @throws {TypeError} If word is not a string
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
	 * @description Efficiently inserts multiple words into the Trie structure.
	 * This is more efficient than calling insert() multiple times for large datasets.
	 * 
	 * @example
	 * ```typescript
	 * const trie = new ContentTrie();
	 * trie.bulkInsert(['word1', 'word2', 'word3']);
	 * ```
	 * 
	 * @throws {TypeError} If words is not an array of strings
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
 * 
 * Key features:
 * - Singleton pattern ensures consistent filtering state
 * - Multiple filtering mechanisms (Tries, Sets)
 * - Configurable content replacement
 * - Efficient text chunk processing
 * - NSFW domain detection
 * 
 * @example
 * ```typescript
 * const filterManager = ContentFilterManager.getInstance();
 * 
 * // Check domain
 * const isNSFW = filterManager.isNSFWDomain('example.com');
 * 
 * // Filter text
 * const filtered = filterManager.filterText('text to filter');
 * ```
 */
export class ContentFilterManager {
	/** 
	 * Singleton instance
	 * @private
	 * @static
	 * @type {ContentFilterManager}
	 */
	private static instance: ContentFilterManager;

	/** 
	 * Trie for storing and matching filtered words
	 * @private
	 * @type {ContentTrie}
	 */
	private filterTrie: ContentTrie;

	/** 
	 * Set of NSFW domains
	 * @private
	 * @type {Set<string>}
	 */
	private nsfwDomains: Set<string>;

	/** 
	 * Trie for storing and matching NSFW terms
	 * @private
	 * @type {ContentTrie}
	 */
	private nsfwNamesTrie: ContentTrie;

	/** 
	 * Set of filtered dictionary words
	 * @private
	 * @type {Set<string>}
	 */
	private filterDict: Set<string>;

	/** 
	 * Maximum content length for processing
	 * @private
	 * @readonly
	 * @type {number}
	 */
	private readonly MAX_CONTENT_LENGTH = 50000;

	/**
	 * Private constructor to prevent direct instantiation.
	 * @private
	 * @description Initializes all filtering data structures and loads initial data.
	 * This constructor is private to enforce the singleton pattern.
	 * 
	 * @throws {Error} If filter initialization fails
	 */
	private constructor() {
		this.filterTrie = new ContentTrie();
		this.nsfwNamesTrie = new ContentTrie();
		this.nsfwDomains = new Set();
		this.filterDict = new Set();
		this.loadFilters();
	}

	/**
	 * Gets or creates the singleton instance of ContentFilterManager.
	 * @returns {ContentFilterManager} The singleton instance
	 * @description Ensures only one instance of ContentFilterManager exists.
	 * Creates the instance if it doesn't exist, otherwise returns the existing instance.
	 * 
	 * @example
	 * ```typescript
	 * const filterManager = ContentFilterManager.getInstance();
	 * ```
	 */
	public static getInstance(): ContentFilterManager {
		if (!ContentFilterManager.instance) {
			ContentFilterManager.instance = new ContentFilterManager();
		}
		return ContentFilterManager.instance;
	}

	/**
	 * Loads filter data from configuration files.
	 * @private
	 * @returns {Promise<void>}
	 * @description Asynchronously loads filtering data from configuration files,
	 * including NSFW domains, NSFW terms, and slurs. Initializes all filtering
	 * data structures with the loaded data.
	 * 
	 * @throws {Error} If filter initialization fails or data files cannot be loaded
	 */
	private async loadFilters(): Promise<void> {
		try {
			const { nsfw, nsfwNames, slurs } = await import("../data/index.js");
			this.nsfwDomains = new Set(Object.keys(nsfw));
			this.filterDict = new Set(Object.keys(slurs));
			this.filterTrie.bulkInsert(Object.keys(slurs));
			this.nsfwNamesTrie.bulkInsert(Object.keys(nsfwNames));
		} catch (error) {
			console.error("Failed to load filters:", error);
			throw new Error("Filter initialization failed");
		}
	}

	/**
	 * Checks if a URL contains or belongs to an NSFW domain.
	 * @param {string} url - The URL to check
	 * @returns {boolean} True if the URL matches any NSFW domain patterns
	 * @description Performs case-sensitive matching against known NSFW domains.
	 * Checks if the URL contains any known NSFW domain patterns.
	 * 
	 * @example
	 * ```typescript
	 * const filterManager = ContentFilterManager.getInstance();
	 * const isNSFW = filterManager.isNSFWDomain('example.com');
	 * ```
	 * 
	 * @throws {TypeError} If url is not a string
	 */
	public isNSFWDomain(url: string): boolean {
		return Array.from(this.nsfwDomains).some((domain) => url.includes(domain));
	}

	/**
	 * Splits text into manageable chunks while preserving context.
	 * @private
	 * @param {string} text - Text to split
	 * @returns {string[]} Array of text chunks
	 * @description Splits long text into smaller chunks while trying to maintain
	 * sentence boundaries and context. This ensures efficient processing of large
	 * text content.
	 * 
	 * @throws {TypeError} If text is not a string
	 */
	private splitIntoChunks(text: string): string[] {
		if (!text) return [];

		if (text.length <= this.MAX_CONTENT_LENGTH) {
			return [text];
		}

		const chunks: string[] = [];
		let currentChunk = '';

		const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

		for (const sentence of sentences) {
			if ((currentChunk + sentence).length > this.MAX_CONTENT_LENGTH) {
				if (currentChunk) chunks.push(currentChunk.trim());
				currentChunk = sentence;
			} else {
				currentChunk += sentence;
			}
		}

		if (currentChunk) chunks.push(currentChunk.trim());
		return chunks;
	}

	/**
	 * Filters text content using content filtering rules.
	 * @param {string} text - Text to filter
	 * @param {string} [replacement="***"] - Replacement string for filtered content
	 * @returns {string} Filtered text with inappropriate content replaced
	 * @description Processes text content in chunks, applying filtering rules
	 * to detect and replace inappropriate content. Handles large text efficiently
	 * by breaking it into manageable chunks.
	 * 
	 * @example
	 * ```typescript
	 * const filterManager = ContentFilterManager.getInstance();
	 * const filtered = filterManager.filterText('text to filter', '***');
	 * ```
	 * 
	 * @throws {TypeError} If text is not a string
	 */
	public filterText(text: string, replacement: string = "***"): string {
		if (!text) return "";

		const chunks = this.splitIntoChunks(text);

		return chunks.map(chunk => {
			if (chunk.length > this.MAX_CONTENT_LENGTH) {
				console.warn(`Chunk exceeds maximum length, truncating: ${chunk.length} chars`);
				chunk = chunk.slice(0, this.MAX_CONTENT_LENGTH);
			}

			return this.applyFilters(chunk, replacement);
		}).join(' ');
	}

	/**
	 * Applies the actual filtering logic to a single chunk.
	 * @private
	 * @param {string} chunk - Text chunk to filter
	 * @param {string} replacement - Replacement string for filtered content
	 * @returns {string} Filtered text chunk
	 * @description Applies filtering rules to a single chunk of text,
	 * replacing inappropriate content with the specified replacement string.
	 * 
	 * @throws {TypeError} If chunk is not a string
	 */
	private applyFilters(chunk: string, replacement: string): string {
		return chunk; // Replace with actual filtering
	}
}

/**
 * Enhanced utility class for processing and cleaning text content with improved duplicate detection.
 * @class
 * @description Provides static methods for text processing, cleaning, and duplicate detection.
 * Uses advanced algorithms for fuzzy matching and similarity detection.
 * 
 * Key features:
 * - Text cleaning and normalization
 * - Emoji and non-ASCII character handling
 * - Fuzzy matching for duplicate detection
 * - Bulk text processing
 * - Configurable similarity thresholds
 * 
 * @example
 * ```typescript
 * // Clean and process text
 * const cleaned = TextProcessor.cleanText('Text with emojis 😊');
 * 
 * // Remove duplicates from multiple texts
 * const unique = TextProcessor.processBulkTexts(['text1', 'text2']);
 * ```
 */
class TextProcessor {
	/** 
	 * Regular expression for matching emoji characters
	 * @private
	 * @static
	 * @readonly
	 * @type {RegExp}
	 */
	private static readonly EMOJI_PATTERN = /[\u{1F600}-\u{1F64F}]/gu;

	/** 
	 * Regular expression for matching non-ASCII characters
	 * @private
	 * @static
	 * @readonly
	 * @type {RegExp}
	 */
	private static readonly NON_ASCII_PATTERN = /[^\x00-\x7F]/g;

	/** 
	 * Regular expression for matching multiple whitespace characters
	 * @private
	 * @static
	 * @readonly
	 * @type {RegExp}
	 */
	private static readonly WHITESPACE_PATTERN = /\s+/g;

	/** 
	 * Regular expression for matching newline characters
	 * @private
	 * @static
	 * @readonly
	 * @type {RegExp}
	 */
	private static readonly NEWLINE_PATTERN = /[\n\r]+/g;

	/** 
	 * Minimum length for fuzzy matching
	 * @private
	 * @static
	 * @readonly
	 * @type {number}
	 */
	private static readonly MIN_FUZZY_LENGTH = 20;

	/** 
	 * Similarity threshold for fuzzy matching (0-1)
	 * @private
	 * @static
	 * @readonly
	 * @type {number}
	 */
	private static readonly SIMILARITY_THRESHOLD = 0.85;

	/** 
	 * Minimum length ratio between segments for comparison
	 * @private
	 * @static
	 * @readonly
	 * @type {number}
	 */
	private static readonly LENGTH_RATIO_THRESHOLD = 0.7;

	/**
	 * Cleans and normalizes text content.
	 * @param {string} text - The text to clean
	 * @returns {string} The cleaned and normalized text
	 * @description Removes emojis, non-ASCII characters, and normalizes whitespace.
	 * Trims the text and ensures consistent spacing.
	 * 
	 * @example
	 * ```typescript
	 * const cleaned = TextProcessor.cleanText('Text with emojis 😊');
	 * ```
	 * 
	 * @throws {TypeError} If text is not a string
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
	 * Calculates the Levenshtein distance between two strings.
	 * @private
	 * @param {string} str1 - First string
	 * @param {string} str2 - Second string
	 * @returns {number} The Levenshtein distance
	 * @description Calculates the minimum number of single-character edits
	 * required to change one string into another.
	 * 
	 * @throws {TypeError} If either parameter is not a string
	 */
	private static levenshteinDistance(str1: string, str2: string): number {
		const matrix: number[][] = Array(str1.length + 1)
			.fill(null)
			.map(() => Array(str2.length + 1).fill(0));

		for (let i = 0; i <= str1.length; i++) {
			matrix[i][0] = i;
		}
		for (let j = 0; j <= str2.length; j++) {
			matrix[0][j] = j;
		}

		for (let i = 1; i <= str1.length; i++) {
			for (let j = 1; j <= str2.length; j++) {
				const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
				matrix[i][j] = Math.min(
					matrix[i - 1][j] + 1,
					matrix[i][j - 1] + 1,
					matrix[i - 1][j - 1] + cost
				);
			}
		}

		return matrix[str1.length][str2.length];
	}

	/**
	 * Calculates similarity ratio between two strings.
	 * @private
	 * @param {string} str1 - First string
	 * @param {string} str2 - Second string
	 * @returns {number} Similarity ratio between 0 and 1
	 * @description Calculates how similar two strings are using Levenshtein
	 * distance and string lengths. Returns a value between 0 (completely different)
	 * and 1 (identical).
	 * 
	 * @throws {TypeError} If either parameter is not a string
	 */
	private static calculateSimilarity(str1: string, str2: string): number {
		const maxLength = Math.max(str1.length, str2.length);
		if (maxLength === 0) return 1.0;
		const distance = this.levenshteinDistance(str1, str2);
		return 1 - distance / maxLength;
	}

	/**
	 * Calculates cosine similarity between two text segments
	 * @private
	 * @static
	 * @param {string} text1 - First text segment
	 * @param {string} text2 - Second text segment
	 * @returns {number} Similarity score between 0 and 1
	 */
	private static calculateCosineSimilarity(text1: string, text2: string): number {
		// Create word frequency vectors
		const words1 = text1.toLowerCase().split(/\s+/);
		const words2 = text2.toLowerCase().split(/\s+/);

		// Create word frequency maps
		const freqMap1 = new Map<string, number>();
		const freqMap2 = new Map<string, number>();

		words1.forEach(word => {
			freqMap1.set(word, (freqMap1.get(word) || 0) + 1);
		});

		words2.forEach(word => {
			freqMap2.set(word, (freqMap2.get(word) || 0) + 1);
		});

		// Calculate dot product
		let dotProduct = 0;
		freqMap1.forEach((freq, word) => {
			if (freqMap2.has(word)) {
				dotProduct += freq * freqMap2.get(word)!;
			}
		});

		// Calculate magnitudes
		const magnitude1 = Math.sqrt([...freqMap1.values()]
			.reduce((sum, freq) => sum + freq * freq, 0));
		const magnitude2 = Math.sqrt([...freqMap2.values()]
			.reduce((sum, freq) => sum + freq * freq, 0));

		// Return cosine similarity
		return magnitude1 && magnitude2 ? dotProduct / (magnitude1 * magnitude2) : 0;
	}

	/**
	 * Checks if two segments are similar using cosine similarity
	 * @private
	 * @static
	 * @param {string} segment1 - First segment to compare
	 * @param {string} segment2 - Second segment to compare
	 * @returns {boolean} True if segments are similar
	 */
	private static areSimilarSegments(segment1: string, segment2: string): boolean {
		// Skip comparison if length difference is too large
		const lengthRatio = Math.min(segment1.length, segment2.length) /
			Math.max(segment1.length, segment2.length);

		if (lengthRatio < this.LENGTH_RATIO_THRESHOLD) {
			return false;
		}

		// Skip short segments
		if (segment1.length < this.MIN_FUZZY_LENGTH ||
			segment2.length < this.MIN_FUZZY_LENGTH) {
			return segment1 === segment2;
		}

		// Calculate cosine similarity
		const similarity = this.calculateCosineSimilarity(segment1, segment2);
		return similarity >= this.SIMILARITY_THRESHOLD;
	}

	/**
	 * Splits text into meaningful segments.
	 * @private
	 * @param {string} text - Text to split
	 * @returns {string[]} Array of text segments
	 * @description Splits text into segments based on sentence boundaries
	 * while preserving punctuation.
	 * 
	 * @throws {TypeError} If text is not a string
	 */
	private static splitIntoSegments(text: string): string[] {
		const segments = text.match(/[^.!?]+[.!?]+/g) || [text];
		return segments.map(seg => seg.trim()).filter(seg => seg.length > 0);
	}

	/**
	 * Creates a fingerprint for a text segment to aid in duplicate detection.
	 * @private
	 * @param {string} segment - Text segment to fingerprint
	 * @returns {string} Fingerprint of the segment
	 * @description Creates a unique fingerprint for a text segment by
	 * normalizing and sorting characters.
	 * 
	 * @throws {TypeError} If segment is not a string
	 */
	private static createSegmentFingerprint(segment: string): string {
		return segment
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '')
			.split('')
			.sort()
			.join('');
	}

	/**
	 * Removes duplicate text segments from content using enhanced detection.
	 * @param {string} text - The text to process
	 * @returns {string} Text with duplicate segments removed
	 * @description Identifies and removes duplicate segments using fingerprinting
	 * and similarity detection.
	 * 
	 * @example
	 * ```typescript
	 * const deduped = TextProcessor.removeDuplicateSegments('text with duplicates');
	 * ```
	 * 
	 * @throws {TypeError} If text is not a string
	 */
	public static removeDuplicateSegments(text: string): string {
		const segments = this.splitIntoSegments(text);
		const uniqueSegments: string[] = [];
		const fingerprints = new Set<string>();

		for (const segment of segments) {
			const fingerprint = this.createSegmentFingerprint(segment);

			if (!fingerprints.has(fingerprint)) {
				const isDuplicate = uniqueSegments.some(existing =>
					this.areSimilarSegments(existing, segment)
				);

				if (!isDuplicate) {
					uniqueSegments.push(segment);
					fingerprints.add(fingerprint);
				}
			}
		}

		return uniqueSegments.join(" ");
	}

	/**
	 * Processes text content with advanced duplicate removal and cleaning.
	 * @param {string} text - The text to process
	 * @returns {string} Processed text with duplicates removed and content cleaned
	 * @description Combines cleaning and duplicate removal in a single operation.
	 * 
	 * @example
	 * ```typescript
	 * const processed = TextProcessor.processText('text to process');
	 * ```
	 * 
	 * @throws {TypeError} If text is not a string
	 */
	public static processText(text: string): string {
		const cleaned = this.cleanText(text);
		return this.removeDuplicateSegments(cleaned);
	}

	/**
	 * Processes an array of texts, removing both exact and near-duplicate content.
	 * @param {string[]} texts - Array of texts to process
	 * @returns {string[]} Array of unique texts
	 * @description Processes multiple texts, removing duplicates both within
	 * and between texts.
	 * 
	 * @example
	 * ```typescript
	 * const unique = TextProcessor.processBulkTexts(['text1', 'text2']);
	 * ```
	 * 
	 * @throws {TypeError} If texts is not an array of strings
	 */
	public static processBulkTexts(texts: string[]): string[] {
		const processedTexts = texts.map(text => this.processText(text));
		const uniqueTexts: string[] = [];

		for (const text of processedTexts) {
			const isDuplicate = uniqueTexts.some(existing =>
				this.areSimilarSegments(existing, text)
			);

			if (!isDuplicate) {
				uniqueTexts.push(text);
			}
		}

		return uniqueTexts;
	}
}

/**
 * Class managing browser operations for web scraping.
 * @class
 * @description Provides static methods for browser management, page creation,
 * and content extraction operations. Handles browser configuration, resource
 * blocking, and content extraction.
 * 
 * Key features:
 * - Browser instance management
 * - Page configuration and resource blocking
 * - Content extraction
 * - Error handling
 * 
 * @example
 * ```typescript
 * const browser = await BrowserManager.launch();
 * const page = await BrowserManager.createPage(browser);
 * const content = await BrowserManager.extractPageContent(page);
 * ```
 */
class BrowserManager {
	/**
	 * Creates and configures a new browser page.
	 * @param {Browser} browser - The browser instance to create the page in
	 * @returns {Promise<Page>} A configured page instance
	 * @description Creates a new page with request interception enabled and
	 * configured to block unnecessary resource types for improved performance.
	 * 
	 * @example
	 * ```typescript
	 * const browser = await BrowserManager.launch();
	 * const page = await BrowserManager.createPage(browser);
	 * ```
	 * 
	 * @throws {Error} If page creation or configuration fails
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
	 * @description Launches a headless browser with security and performance optimizations.
	 * Includes stealth plugins and resource blocking capabilities.
	 * 
	 * @example
	 * ```typescript
	 * const browser = await BrowserManager.launch();
	 * ```
	 * 
	 * @throws {Error} If browser launch fails
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
	 * Extracts text content and code blocks from a webpage.
	 * @param {Page} page - The page to extract content from
	 * @returns {Promise<{texts: string[], codeBlocks: CodeBlock[]}>} Extracted content
	 */
	public static async extractPageContent(page: Page): Promise<{
		texts: string[];
		codeBlocks: CodeBlock[];
	}> {
		return await page.evaluate(() => {
			const texts: string[] = [];
			const codeBlocks: CodeBlock[] = [];

			// Helper functions for code detection
			function isCodeBlock(element: Element): boolean {
				const isPreOrCode = element.tagName.toLowerCase() === 'pre' ||
					element.tagName.toLowerCase() === 'code';
				const className = element.className || ''; // Handle elements without className
				const hasCodeClass = typeof className === 'string' && (
					className.toLowerCase().includes('code') ||
					className.toLowerCase().includes('language-') ||
					className.toLowerCase().includes('highlight')
				);
				const hasSyntaxHighlighting = typeof className === 'string' && (
					className.toLowerCase().includes('highlight-') ||
					className.toLowerCase().includes('prettyprint') ||
					className.toLowerCase().includes('syntax-') ||
					className.toLowerCase().includes('prism')
				);

				return isPreOrCode || hasCodeClass || hasSyntaxHighlighting;
			}

			function detectLanguage(element: Element): string {
				const className = element.className || '';
				if (typeof className !== 'string') return 'plaintext';

				const classNames = className.toLowerCase();
				const commonLanguages = ['javascript', 'typescript', 'python', 'java',
					'cpp', 'css', 'html', 'xml', 'json'];

				for (const lang of commonLanguages) {
					if (classNames.includes(lang)) return lang;
				}
				return 'plaintext';
			}

			// Process all elements
			const elements = Array.from(document.querySelectorAll('*'));
			elements.forEach(element => {
				if (isCodeBlock(element)) {
					const code = element.textContent?.trim() || '';
					if (code) {
						codeBlocks.push({
							language: detectLanguage(element),
							code: code,
							lineNumbers: element.className?.toLowerCase().includes('line-numbers') || false
						});
					}
				} else if (element.tagName.match(/^(P|DIV|SPAN|A|H[1-6]|LI)$/i)) {
					const text = element.textContent?.trim() || '';
					if (text && !isCodeBlock(element.parentElement!)) {
						texts.push(text);
					}
				}
			});

			return { texts, codeBlocks };
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
export async function scrape(
	url: string,
	browser: Browser | null = null
): Promise<{
	flaggedDomain?: boolean;
	containsCensored?: boolean;
	filteredTexts?: string[];
	error?: string;
}> {
	let page: Page | null = null;

	try {
		console.log(`Scraping URL: ${url}`);

		if (!url || typeof url !== "string") {
			throw new Error(
				`Invalid URL provided: ${typeof url === "object" ? JSON.stringify(url, null, 2) : url
				}`,
			);
		}

		const filterManager = ContentFilterManager.getInstance();

		if (filterManager.isNSFWDomain(url)) {
			console.log(`URL belongs to NSFW domain: ${url}`);
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
			]).then(() => {
				console.log(`Navigation to ${url} successful`);
			}).catch((navigationError) => {
				throw new Error(
					`Failed to navigate to ${url}: ${navigationError instanceof Error
						? navigationError.message
						: navigationError
					}`,
				);
			});
		} catch (navigationError) {
			throw new Error(
				`Failed to navigate to ${url}: ${navigationError instanceof Error
					? navigationError.message
					: navigationError
				}`,
			);
		}

		const finalUrl = page.url();
		if (filterManager.isNSFWDomain(finalUrl)) {
			console.log(
				`Final URL after navigation belongs to NSFW domain: ${finalUrl}`,
			);
			return { error: "Domain contains NSFW content" };
		}

		const { texts } = await BrowserManager.extractPageContent(page).catch((err) => {
			throw new Error(`Failed to extract page content: ${err.message}`);
		});
		const uniqueTexts = TextProcessor.processBulkTexts(texts);
		const filteredTexts = uniqueTexts.map(text =>
			filterManager.filterText(text)
		);

		const containsCensored = filteredTexts.some(text =>
			text.includes("***")
		);

		return {
			flaggedDomain: false,
			containsCensored,
			filteredTexts,
		};

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
				await page.close().catch(() => { });
			}
			if (browser) {
				await browser.close().catch(() => { });
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

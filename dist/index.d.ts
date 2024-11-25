import { ModelParams, GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

declare class ContentFilter {
    private static instance;
    private restrictedDomains;
    private constructor();
    static getInstance(): ContentFilter;
    initialize(): Promise<void>;
    private normalizeDomain;
    isRestricted(url: string): boolean;
    filterText(text: string): string;
}
declare function scrape(url: string): Promise<{
    filteredTexts?: string[];
    error?: string;
}>;

interface RiskMetrics {
    securityScore: number;
    contentRisk: number;
    behaviorRisk: number;
    technicalRisk: number;
}
interface PageResult {
    url: string;
    contentPath: string;
    processedContentPath: string;
    screenshot: string;
    error?: string;
    timestamp: number;
    riskLevel?: RiskLevel;
    riskMetrics?: RiskMetrics;
}
declare enum RiskLevel {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH",
    CRITICAL = "CRITICAL"
}
interface ScraperConfig {
    outputDir?: string;
    maxConcurrentPages?: number;
    maxDepth?: number;
    screenshotOptions?: {
        fullPage?: boolean;
        timeout?: number;
        scrollInterval?: number;
    };
    retryOptions?: {
        maxRetries: number;
        retryDelay: number;
    };
    cacheOptions?: {
        max: number;
        ttl: number;
    };
}
declare class RateLimiter {
    private tokens;
    private readonly maxTokens;
    private readonly refillRate;
    private lastRefill;
    constructor(maxTokens: number, refillRate: number);
    acquire(): Promise<void>;
    private refill;
}
declare class WebScraper {
    private browser;
    private readonly results;
    private readonly processedUrls;
    private readonly outputDir;
    private readonly maxConcurrentPages;
    private readonly contentFilter;
    private readonly validator;
    private readonly sentimentAnalyzer;
    private baseUrl;
    private readonly maxDepth;
    private readonly semaphore;
    private isShuttingDown;
    private readonly pagePool;
    private readonly resultPromises;
    private readonly timeouts;
    private readonly rateLimiter;
    private static readonly TIMEOUTS;
    constructor(config?: ScraperConfig);
    scrapeWebsite(url: string): Promise<Map<string, PageResult>>;
    private initialize;
    private getPage;
    private releasePage;
    private processSinglePage;
    private processPageInternal;
    private cleanup;
    private processPage;
    private processPageContent;
    private scrapeWithRetry;
    private extractValidLinks;
    private formatAsMarkdown;
    private isSameOrigin;
    private normalizeUrl;
    private chunkArray;
    private processContent;
    private processWithLLM;
    private takeScreenshot;
    private scrollPage;
    private createErrorResult;
    private saveToFile;
    private generateRoutePath;
    private isNonTextualFile;
    private isValidUrl;
    private handleShutdown;
    private saveScrapingReport;
}

/**
 * @fileoverview Content analysis and prompt generation system for web content processing
 * @module content-analyzer
 * @description Provides comprehensive functionality for analyzing web content structure and generating
 * context-aware prompts for LLM processing. The module includes two main classes:
 * - ContentAnalyzer: Analyzes web content to determine its context and characteristics
 * - PromptGenerator: Generates tailored prompts based on the analyzed content context
 *
 * Key features:
 * - URL pattern matching and content signal detection
 * - Content type classification (article, product, profile, etc.)
 * - Structure analysis (narrative, analytical, technical, etc.)
 * - Context-aware prompt generation
 * - Flexible template system for different content types
 *
 * @example
 * ```typescript
 * // Analyze content
 * const context = ContentAnalyzer.analyzeContent(url, htmlContent);
 *
 * // Generate appropriate prompt
 * const prompt = PromptGenerator.generatePrompt(context, content);
 * ```
 */
/**
 * Represents the context and characteristics of analyzed content
 * @interface ContentContext
 * @property {('article'|'product'|'category'|'profile'|'general')} pageType - The type of page being analyzed:
 *   - article: Blog posts, news articles, editorial content
 *   - product: Product pages, item listings, shop entries
 *   - category: Category pages, department listings, sections
 *   - profile: User profiles, about pages, portfolios
 *   - general: Default type for unclassified content
 * @property {('brief'|'standard'|'detailed')} contentLength - The relative length/depth of the content:
 *   - brief: Short-form content, summaries
 *   - standard: Medium-length content
 *   - detailed: Long-form, in-depth content
 * @property {('narrative'|'analytical'|'technical'|'descriptive')} structureType - The structural style of the content:
 *   - narrative: Story-based, chronological flow
 *   - analytical: Data-driven, research-oriented
 *   - technical: Specification-focused, procedural
 *   - descriptive: Feature-focused, explanatory
 * @property {('general'|'technical'|'business'|'academic')} targetAudience - The intended audience for the content:
 *   - general: General public, non-specialized readers
 *   - technical: Technical professionals, developers
 *   - business: Business professionals, stakeholders
 *   - academic: Researchers, students, educators
 */
interface ContentContext$1 {
    pageType: 'article' | 'product' | 'category' | 'profile' | 'general';
    contentLength: 'brief' | 'standard' | 'detailed';
    structureType: 'narrative' | 'analytical' | 'technical' | 'descriptive';
    targetAudience: 'general' | 'technical' | 'business' | 'academic';
}
/**
 * Analyzes web content to determine its context and characteristics
 * @class ContentAnalyzer
 * @static
 * @description Provides static methods for analyzing web content and determining its context.
 * Uses pattern matching and content signals to classify content and determine appropriate
 * processing strategies. The analysis considers:
 * - URL patterns and structure
 * - Content keywords and signals
 * - Document structure and elements
 * - Content indicators and metadata
 */
declare class ContentAnalyzer {
    /**
     * Predefined patterns for analyzing different types of content routes
     * @private
     * @static
     * @readonly
     * @type {RouteAnalysis[]}
     * @description Array of route analysis configurations that define:
     * - URL patterns to match different content types
     * - Content signals associated with each type
     * - Default context settings for matched content
     * Each configuration targets a specific content category (article, product, etc.)
     * and provides the basis for content classification.
     */
    private static readonly routePatterns;
    /**
     * Extracts content signals from HTML content by analyzing structure and keywords
     * @private
     * @static
     * @param {string} content - The HTML content to analyze
     * @returns {Set<string>} Set of identified content signals
     * @description Analyzes HTML content to identify structural and keyword signals:
     * - Checks for presence of headers, lists, and tables
     * - Identifies content-specific keywords and patterns
     * - Detects pricing information and author attribution
     * - Recognizes profile and biographical content
     * The signals are used to help classify and contextualize the content.
     */
    private static getContentSignals;
    /**
     * Analyzes content and URL to determine the appropriate content context
     * @public
     * @static
     * @param {string} url - The URL of the content being analyzed
     * @param {string} content - The HTML content to analyze
     * @returns {ContentContext} The determined content context
     * @description Performs comprehensive content analysis by:
     * 1. Extracting and analyzing the URL path
     * 2. Identifying content signals from the HTML
     * 3. Matching against predefined route patterns
     * 4. Determining the most appropriate content context
     * If no specific matches are found, returns a default general context.
     *
     * @example
     * ```typescript
     * const context = ContentAnalyzer.analyzeContent(
     *   'https://example.com/blog/article-1',
     *   '<html>...</html>'
     * );
     * ```
     */
    static analyzeContent(url: string, content: string): ContentContext$1;
}
/**
 * Generates context-aware prompts for LLM content processing
 * @class PromptGenerator
 * @static
 * @description Provides functionality for generating tailored prompts based on content context.
 * Features:
 * - Template-based prompt generation
 * - Context-aware prompt customization
 * - Support for multiple content types and structures
 * - Fallback to default prompts when needed
 */
declare class PromptGenerator {
    /**
     * Template definitions for different content types and structures
     * @private
     * @static
     * @readonly
     * @type {Object}
     * @description Comprehensive template system that provides:
     * - Content type-specific templates (article, product, profile)
     * - Structure-specific variations (narrative, analytical, technical)
     * - Detailed processing instructions
     * - Placeholder support for content insertion
     * Templates are organized hierarchically by content type and structure.
     */
    private static readonly promptTemplates;
    /**
     * Generates an appropriate prompt based on content context
     * @public
     * @static
     * @param {ContentContext} context - The analyzed content context
     * @param {string} content - The content to be processed
     * @returns {string} Generated prompt for LLM processing
     * @description Generates a context-appropriate prompt by:
     * 1. Selecting appropriate template based on content type
     * 2. Choosing structure-specific variation
     * 3. Inserting content into template
     * 4. Falling back to default prompt if no specific template exists
     *
     * @example
     * ```typescript
     * const prompt = PromptGenerator.generatePrompt(
     *   { pageType: 'article', structureType: 'narrative', ... },
     *   'Article content...'
     * );
     * ```
     */
    static generatePrompt(context: ContentContext$1, content: string): string;
    /**
     * Provides a default prompt when no specific template matches
     * @private
     * @static
     * @param {string} content - The content to be processed
     * @returns {string} Default analysis prompt
     * @description Generates a generic but comprehensive prompt for content analysis
     * when no specific template matches the content context. The default prompt
     * focuses on:
     * - Topic extraction
     * - Content organization
     * - Redundancy removal
     * - Clarity and readability
     */
    private static getDefaultPrompt;
}

interface WorkerMessage<T = any> {
    id: string;
    type: "TASK" | "RESULT" | "ERROR" | "STATUS" | "READY" | "INIT";
    payload: T;
    timestamp: number;
}
interface WorkerTask {
    id: string;
    type: "TASK" | "RESULT" | "ERROR" | "STATUS" | "READY" | "INIT";
    url?: string;
    data?: any;
}
interface TrieNode {
    children: {
        [key: string]: TrieNode;
    };
    isEndOfWord: boolean;
}
interface ContentContext {
    pageType: 'article' | 'product' | 'category' | 'profile' | 'general';
    contentLength: 'brief' | 'standard' | 'detailed';
    structureType: 'narrative' | 'analytical' | 'technical' | 'descriptive';
    targetAudience: 'general' | 'technical' | 'business' | 'academic';
}
interface RouteAnalysis {
    patterns: RegExp[];
    signals: string[];
    context: ContentContext;
}
interface CodeBlock {
    language: string;
    code: string;
    lineNumbers?: boolean;
}

/**
 * @fileoverview Configuration settings for Google's Gemini AI model integration
 * @module gemini-settings
 * @description Provides configuration constants and settings for interacting with the Gemini AI API,
 * including model selection, API authentication, and content safety thresholds
 */

/**
 * The specific Gemini model version to use
 * @constant {string}
 * @description Specifies the Gemini 1.5 Flash model, optimized for fast inference
 */
declare const gemini_model: ModelParams;
/**
 * Google AI API key loaded from environment variables
 * @constant {string}
 * @description API key for authenticating with Google's AI services. Falls back to empty string if not configured
 */
declare const API_KEY: string;
/**
 * Initialized Google Generative AI client
 * @constant {GoogleGenerativeAI}
 * @description Main client instance for interacting with Gemini AI services
 */
declare const genAI: GoogleGenerativeAI;
/**
 * Generation configuration settings
 * @constant {undefined}
 * @description Currently undefined, can be used to specify generation parameters like temperature, top-k, etc.
 */
declare const generationConfig: undefined;
/**
 * Content safety threshold settings
 * @constant {Array<{category: HarmCategory, threshold: HarmBlockThreshold}>}
 * @description Configures content filtering thresholds for different harm categories:
 * - Harassment
 * - Hate Speech
 * - Sexually Explicit Content
 * - Dangerous Content
 * All thresholds are currently set to BLOCK_NONE for maximum permissiveness
 */
declare const safetySettings: {
    category: HarmCategory;
    threshold: HarmBlockThreshold;
}[];

export { API_KEY, type CodeBlock, ContentAnalyzer, type ContentContext, ContentFilter, PromptGenerator, RateLimiter, type RouteAnalysis, type TrieNode, WebScraper, type WorkerMessage, type WorkerTask, gemini_model, genAI, generationConfig, safetySettings, scrape };

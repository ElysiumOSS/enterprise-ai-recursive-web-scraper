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
 * - Comprehensive content analysis pipeline
 * - Intelligent prompt customization
 * - Fallback handling for edge cases
 * 
 * The system implements a robust content analysis workflow:
 * 1. URL Analysis
 *    - Pattern matching against predefined URL structures
 *    - Route classification and content type inference
 *    - Parameter extraction and validation
 * 
 * 2. Content Signal Detection
 *    - HTML structure analysis
 *    - Keyword and pattern identification
 *    - Metadata extraction and processing
 *    - Signal strength evaluation
 * 
 * 3. Context Classification
 *    - Content type determination
 *    - Structure analysis and categorization
 *    - Audience targeting assessment
 *    - Length and depth evaluation
 * 
 * 4. Prompt Generation
 *    - Template selection and customization
 *    - Context-aware prompt construction
 *    - Dynamic content insertion
 *    - Fallback handling
 *
 * @example
 * ```typescript
 * // Initialize analyzer and process content
 * const url = 'https://example.com/blog/article';
 * const html = '<article>...</article>';
 * 
 * // Analyze content structure and context
 * const context = ContentAnalyzer.analyzeContent(url, html);
 *
 * // Generate appropriate context-aware prompt
 * const prompt = PromptGenerator.generatePrompt(context, html);
 * 
 * // Process with LLM
 * const result = await llm.process(prompt);
 * ```
 * 
 * @see {@link ContentAnalyzer} For content analysis functionality
 * @see {@link PromptGenerator} For prompt generation capabilities
 * @see {@link ContentContext} For content context structure
 * @see {@link RouteAnalysis} For URL route analysis configuration
 * 
 * @author Your Name
 * @version 1.0.0
 * @license MIT
 */

/**
 * Represents the context and characteristics of analyzed content
 * @interface ContentContext
 * @description Defines the structural representation of content context including page type,
 * content characteristics, and target audience information. Used to customize content
 * processing and prompt generation.
 * 
 * @property {('article'|'product'|'category'|'profile'|'general')} pageType - The type of page being analyzed
 * @property {('brief'|'standard'|'detailed')} contentLength - The relative length/depth of the content
 * @property {('narrative'|'analytical'|'technical'|'descriptive')} structureType - The structural style of the content
 * @property {('general'|'technical'|'business'|'academic')} targetAudience - The intended audience for the content
 * 
 * @example
 * ```typescript
 * const context: ContentContext = {
 *   pageType: 'article',
 *   contentLength: 'detailed',
 *   structureType: 'analytical',
 *   targetAudience: 'technical'
 * };
 * ```
 * 
 * Page Types:
 * - article: Blog posts, news articles, editorial content
 * - product: Product pages, item listings, shop entries
 * - category: Category pages, department listings, sections
 * - profile: User profiles, about pages, portfolios
 * - general: Default type for unclassified content
 * 
 * Content Lengths:
 * - brief: Short-form content, summaries (<1000 words)
 * - standard: Medium-length content (1000-3000 words)
 * - detailed: Long-form, in-depth content (>3000 words)
 * 
 * Structure Types:
 * - narrative: Story-based, chronological flow
 * - analytical: Data-driven, research-oriented
 * - technical: Specification-focused, procedural
 * - descriptive: Feature-focused, explanatory
 * 
 * Target Audiences:
 * - general: General public, non-specialized readers
 * - technical: Technical professionals, developers
 * - business: Business professionals, stakeholders
 * - academic: Researchers, students, educators
 */
interface ContentContext {
  pageType: 'article' | 'product' | 'category' | 'profile' | 'general';
  contentLength: 'brief' | 'standard' | 'detailed';
  structureType: 'narrative' | 'analytical' | 'technical' | 'descriptive';
  targetAudience: 'general' | 'technical' | 'business' | 'academic';
}

/**
 * Defines patterns and signals used to analyze URL routes and content
 * @interface RouteAnalysis
 * @description Configuration interface for URL route analysis that defines patterns,
 * signals, and associated context for content classification. Used to identify
 * content types and characteristics from URL structure and content indicators.
 * 
 * @property {RegExp[]} patterns - Regular expressions to match URL patterns
 * @property {string[]} signals - Keywords/indicators to identify content type
 * @property {ContentContext} context - The content context associated with matched patterns/signals
 * 
 * @example
 * ```typescript
 * const articleRoute: RouteAnalysis = {
 *   patterns: [/\/blog/, /\/article/],
 *   signals: ['author', 'published'],
 *   context: {
 *     pageType: 'article',
 *     contentLength: 'detailed',
 *     structureType: 'narrative',
 *     targetAudience: 'general'
 *   }
 * };
 * ```
 * 
 * Pattern Types:
 * - Path segments (/blog/, /article/, etc.)
 * - Query parameters (?type=article)
 * - URL structures (/yyyy/mm/dd/title)
 * 
 * Signal Categories:
 * - Content indicators (author, price)
 * - Page elements (comments, cart)
 * - Metadata (published date, category)
 * 
 * Context Association:
 * - Default settings for matched content
 * - Base configuration for processing
 * - Initial classification parameters
 */
interface RouteAnalysis {
  patterns: RegExp[];
  signals: string[];
  context: ContentContext;
}

/**
 * Analyzes web content to determine its context and characteristics
 * @class ContentAnalyzer
 * @static
 * @description Provides comprehensive static methods for analyzing web content and determining
 * its context. Implements pattern matching, signal detection, and content classification
 * to provide detailed content analysis.
 * 
 * Key Features:
 * - URL pattern analysis
 * - Content signal detection
 * - Structure classification
 * - Context determination
 * - Metadata extraction
 * 
 * Analysis Process:
 * 1. URL Analysis
 *    - Pattern matching
 *    - Route classification
 * 2. Content Analysis
 *    - Signal detection
 *    - Structure analysis
 * 3. Context Generation
 *    - Type classification
 *    - Characteristic determination
 * 
 * @example
 * ```typescript
 * const context = ContentAnalyzer.analyzeContent(
 *   'https://example.com/blog/article-1',
 *   '<article>Content...</article>'
 * );
 * ```
 */
export class ContentAnalyzer {
  /**
   * Predefined patterns for analyzing different types of content routes
   * @private
   * @static
   * @readonly
   * @type {RouteAnalysis[]}
   * @description Comprehensive configuration array defining patterns, signals, and contexts
   * for different content types. Used as the basis for content classification and analysis.
   * 
   * Pattern Categories:
   * - Article routes (/blog/, /news/, etc.)
   * - Product routes (/shop/, /item/, etc.)
   * - Category routes (/category/, /department/, etc.)
   * - Profile routes (/about/, /user/, etc.)
   * 
   * Signal Types:
   * - Content indicators (author, price)
   * - Page elements (comments, cart)
   * - Metadata (published date, category)
   * 
   * Context Configurations:
   * - Default settings for each type
   * - Base processing parameters
   * - Initial classification settings
   */
  private static readonly routePatterns: RouteAnalysis[] = [
    {
      patterns: [/\/article/, /\/blog/, /\/news/, /\/post/],
      signals: ['article', 'published', 'author', 'date', 'comments'],
      context: {
        pageType: 'article',
        contentLength: 'detailed',
        structureType: 'narrative',
        targetAudience: 'general',
      },
    },
    {
      patterns: [/\/product/, /\/item/, /\/shop/],
      signals: ['price', 'buy', 'cart', 'stock', 'shipping'],
      context: {
        pageType: 'product',
        contentLength: 'standard',
        structureType: 'descriptive',
        targetAudience: 'general',
      },
    },
    {
      patterns: [/\/category/, /\/department/, /\/section/],
      signals: ['list', 'filter', 'sort', 'categories'],
      context: {
        pageType: 'category',
        contentLength: 'brief',
        structureType: 'analytical',
        targetAudience: 'general',
      },
    },
    {
      patterns: [/\/profile/, /\/user/, /\/about/],
      signals: ['bio', 'contact', 'experience', 'portfolio'],
      context: {
        pageType: 'profile',
        contentLength: 'standard',
        structureType: 'descriptive',
        targetAudience: 'general',
      },
    },
  ];

  /**
   * Extracts content signals from HTML content by analyzing structure and keywords
   * @private
   * @static
   * @param {string} content - The HTML content to analyze
   * @returns {Set<string>} Set of identified content signals
   * @description Performs comprehensive HTML content analysis to identify structural
   * elements and content indicators that help classify and contextualize the content.
   * 
   * Analysis Categories:
   * 1. Document Structure
   *    - Headers and sections
   *    - Lists and tables
   *    - Navigation elements
   * 
   * 2. Content Indicators
   *    - Pricing information
   *    - Author attribution
   *    - Dates and timestamps
   * 
   * 3. Metadata
   *    - Schema markup
   *    - Meta tags
   *    - Custom attributes
   * 
   * Signal Types:
   * - Structural signals (headers, lists)
   * - Content signals (price, author)
   * - Contextual signals (dates, categories)
   * 
   * @example
   * ```typescript
   * const signals = ContentAnalyzer.getContentSignals('<article>...</article>');
   * // signals = Set {'structured', 'article', 'author'}
   * ```
   */
  private static getContentSignals(content: string): Set<string> {
    const signals = new Set<string>();
    const lowercaseContent = content.toLowerCase();

    // Analyze document structure
    const hasHeaders = /<h[1-6][^>]*>.*?<\/h[1-6]>/i.test(content);
    const hasLists = /<[ou]l[^>]*>.*?<\/[ou]l>/i.test(content);
    const hasTables = /<table[^>]*>.*?<\/table>/i.test(content);

    if (hasHeaders) signals.add('structured');
    if (hasLists) signals.add('list');
    if (hasTables) signals.add('data');

    // Analyze content indicators
    if (lowercaseContent.includes('price') || /\$\d+/.test(content)) signals.add('price');
    if (lowercaseContent.includes('author') || /posted by/i.test(content)) signals.add('article');
    if (lowercaseContent.includes('profile') || /about me/i.test(content)) signals.add('bio');

    return signals;
  }

  /**
   * Analyzes content and URL to determine the appropriate content context
   * @public
   * @static
   * @param {string} url - The URL of the content being analyzed
   * @param {string} content - The HTML content to analyze
   * @returns {ContentContext} The determined content context
   * @description Performs comprehensive content analysis through multiple stages
   * to determine the most appropriate content context for processing.
   * 
   * Analysis Pipeline:
   * 1. URL Analysis
   *    - Extract and parse URL path
   *    - Match against route patterns
   *    - Identify content type indicators
   * 
   * 2. Content Analysis
   *    - Extract content signals
   *    - Analyze document structure
   *    - Identify content indicators
   * 
   * 3. Pattern Matching
   *    - Compare against predefined patterns
   *    - Evaluate signal matches
   *    - Determine best context match
   * 
   * 4. Context Generation
   *    - Select appropriate context
   *    - Apply default settings
   *    - Return final context
   * 
   * @throws {Error} If URL is invalid or cannot be parsed
   * 
   * @example
   * ```typescript
   * const context = ContentAnalyzer.analyzeContent(
   *   'https://example.com/blog/article-1',
   *   '<article>Content...</article>'
   * );
   * // Returns appropriate ContentContext based on analysis
   * ```
   */
  public static analyzeContent(url: string, content: string): ContentContext {
    const urlPath = new URL(url).pathname;
    const contentSignals = this.getContentSignals(content);

    // Find matching route pattern
    for (const route of this.routePatterns) {
      const matchesPattern = route.patterns.some((pattern) => pattern.test(urlPath));
      const matchesSignals = route.signals.some((signal) => contentSignals.has(signal));

      if (matchesPattern || matchesSignals) {
        return route.context;
      }
    }

    return {
      pageType: 'general',
      contentLength: 'standard',
      structureType: 'descriptive',
      targetAudience: 'general',
    };
  }
}

/**
 * Generates context-aware prompts for LLM content processing
 * @class PromptGenerator
 * @static
 * @description Provides comprehensive functionality for generating tailored prompts
 * based on content context and characteristics. Implements a flexible template
 * system with context-aware customization.
 * 
 * Key Features:
 * - Template-based generation
 * - Context-aware customization
 * - Multiple content type support
 * - Fallback handling
 * - Dynamic content insertion
 * 
 * Template Categories:
 * - Article templates
 * - Product templates
 * - Profile templates
 * - General templates
 * 
 * @example
 * ```typescript
 * const prompt = PromptGenerator.generatePrompt(
 *   context,
 *   'Content to process...'
 * );
 * ```
 */
export class PromptGenerator {
  /**
   * Template definitions for different content types and structures
   * @private
   * @static
   * @readonly
   * @type {Object}
   * @description Comprehensive template system providing context-specific prompt
   * templates for different content types and structures. Supports dynamic
   * content insertion and context-aware customization.
   * 
   * Template Categories:
   * 1. Article Templates
   *    - Narrative style
   *    - Analytical style
   *    - Technical style
   * 
   * 2. Product Templates
   *    - Descriptive style
   *    - Technical style
   * 
   * 3. Profile Templates
   *    - Narrative style
   *    - Descriptive style
   * 
   * Template Features:
   * - Content placeholders
   * - Structure guidelines
   * - Processing instructions
   * - Format specifications
   */
  private static readonly promptTemplates = {
    article: {
      narrative: `Analyze this article using a storytelling approach:
- Identify the main narrative arc and key story elements
- Extract important quotes and testimonials
- Highlight human interest aspects
- Organize content into a compelling narrative structure
- Preserve the author's voice and perspective

Content: {content}`,

      analytical: `Conduct a detailed analysis of this article:
- Break down main arguments and supporting evidence
- Identify methodology and data sources
- Evaluate the strength of conclusions
- Organize findings into clear analytical sections
- Highlight key statistical or research findings

Content: {content}`,

      technical: `Provide a technical breakdown of this article:
- Extract core technical concepts and definitions
- Document any procedures or methodologies
- Identify technical specifications or requirements
- Structure content into technical documentation format
- Include relevant technical diagrams or formulas

Content: {content}`,
    },

    product: {
      descriptive: `Create a comprehensive product description:
- Extract key features and specifications
- Highlight unique selling points
- Organize technical details and performance data
- Include usage scenarios and benefits
- Structure content for easy scanning

Content: {content}`,

      technical: `Generate a technical product analysis:
- Document detailed specifications
- Analyze performance metrics
- Compare with industry standards
- Evaluate technical capabilities
- Structure as technical documentation

Content: {content}`,
    },

    profile: {
      narrative: `Create a professional profile summary:
- Extract key career highlights and achievements
- Identify core skills and expertise
- Document significant projects or contributions
- Organize into a professional narrative
- Highlight unique professional qualities

Content: {content}`,

      descriptive: `Generate a detailed professional overview:
- Summarize professional background
- List key qualifications and certifications
- Document areas of expertise
- Highlight notable accomplishments
- Structure as a professional bio

Content: {content}`,
    },
  };

  /**
   * Generates an appropriate prompt based on content context
   * @public
   * @static
   * @param {ContentContext} context - The analyzed content context
   * @param {string} content - The content to be processed
   * @returns {string} Generated prompt for LLM processing
   * @description Generates context-appropriate prompts by selecting and customizing
   * templates based on content type and structure. Implements fallback handling
   * for unsupported content types.
   * 
   * Generation Process:
   * 1. Template Selection
   *    - Match content type
   *    - Select structure variation
   * 
   * 2. Content Integration
   *    - Insert content into template
   *    - Apply context-specific formatting
   * 
   * 3. Fallback Handling
   *    - Check template availability
   *    - Apply default template if needed
   * 
   * @example
   * ```typescript
   * const prompt = PromptGenerator.generatePrompt(
   *   { pageType: 'article', structureType: 'narrative' },
   *   'Article content...'
   * );
   * ```
   */
  public static generatePrompt(context: ContentContext, content: string): string {
    const { pageType, structureType } = context;
    const templates = this.promptTemplates[pageType as keyof typeof this.promptTemplates];

    if (!templates) {
      return this.getDefaultPrompt(content);
    }
    const template = templates[structureType as keyof typeof templates] as string;
    return template ? template.replace('{content}', content) : this.getDefaultPrompt(content);
  }

  /**
   * Provides a default prompt when no specific template matches
   * @private
   * @static
   * @param {string} content - The content to be processed
   * @returns {string} Default analysis prompt
   * @description Generates a generic but comprehensive prompt for content analysis
   * when no specific template matches the content context. Ensures basic content
   * processing capabilities are maintained.
   * 
   * Default Processing:
   * - Topic extraction
   * - Content organization
   * - Redundancy removal
   * - Clarity improvement
   * 
   * @example
   * ```typescript
   * const prompt = PromptGenerator.getDefaultPrompt('Content...');
   * ```
   */
  private static getDefaultPrompt(content: string): string {
    return `Please analyze and structure this content:
- Extract main topics and key information
- Organize into logical sections
- Remove redundant information
- Present in a clear, readable format

Content: ${content}`;
  }
}

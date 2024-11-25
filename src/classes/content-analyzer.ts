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
interface ContentContext {
  pageType: 'article' | 'product' | 'category' | 'profile' | 'general';
  contentLength: 'brief' | 'standard' | 'detailed';
  structureType: 'narrative' | 'analytical' | 'technical' | 'descriptive';
  targetAudience: 'general' | 'technical' | 'business' | 'academic';
}

/**
 * Defines patterns and signals used to analyze URL routes and content
 * @interface RouteAnalysis
 * @property {RegExp[]} patterns - Regular expressions to match URL patterns:
 *   - Matches URL path segments that indicate content type
 *   - Used for initial content classification
 * @property {string[]} signals - Keywords/indicators to identify content type:
 *   - Common terms associated with content types
 *   - Used for content verification and classification
 * @property {ContentContext} context - The content context associated with matched patterns/signals:
 *   - Predefined context settings for each route type
 *   - Used as base context when matches are found
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
 * @description Provides static methods for analyzing web content and determining its context.
 * Uses pattern matching and content signals to classify content and determine appropriate
 * processing strategies. The analysis considers:
 * - URL patterns and structure
 * - Content keywords and signals
 * - Document structure and elements
 * - Content indicators and metadata
 */
export class ContentAnalyzer {
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
   * @description Analyzes HTML content to identify structural and keyword signals:
   * - Checks for presence of headers, lists, and tables
   * - Identifies content-specific keywords and patterns
   * - Detects pricing information and author attribution
   * - Recognizes profile and biographical content
   * The signals are used to help classify and contextualize the content.
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
 * @description Provides functionality for generating tailored prompts based on content context.
 * Features:
 * - Template-based prompt generation
 * - Context-aware prompt customization
 * - Support for multiple content types and structures
 * - Fallback to default prompts when needed
 */
export class PromptGenerator {
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
   * when no specific template matches the content context. The default prompt
   * focuses on:
   * - Topic extraction
   * - Content organization
   * - Redundancy removal
   * - Clarity and readability
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

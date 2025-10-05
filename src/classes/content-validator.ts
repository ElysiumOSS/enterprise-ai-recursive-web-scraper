/**
 * @fileoverview Content validation system for ensuring content safety and appropriateness
 * @module content-validator
 * @description Provides comprehensive content validation through multiple approaches:
 * - Pattern matching for suspicious content
 * - Keyword combination analysis
 * - Sentiment analysis
 * - AI-powered safety checks
 * - Domain restriction validation
 *
 * @author Mike Odnis
 * @version 1.0.0
 * @license Apache-2.0
 */

import { gemini_model } from '../constants/gemini-settings.js';
import { ContentFilter } from './scraper.js';

/**
 * Validates and analyzes content for safety and appropriateness
 * @class ContentValidator
 * @description Implements a multi-layered content validation system using:
 * - Regular expression pattern matching
 * - Keyword combination detection
 * - Sentiment analysis scoring
 * - AI model safety verification
 * - Domain restriction checking
 *
 * The validator uses multiple approaches to provide comprehensive content safety analysis:
 * 1. Pattern matching for suspicious content patterns
 * 2. Keyword combination detection for potentially unsafe content
 * 3. Sentiment analysis to detect extremely negative content
 * 4. AI model verification for content safety
 * 5. Domain restriction validation against known unsafe domains
 */
export class ContentValidator {
  /** Content filtering instance for domain checks */
  private readonly contentFilter: ContentFilter;

  /** Sentiment analysis implementation */
  private readonly sentimentAnalyzer: any;

  /** Threshold for negative sentiment content */
  private readonly NEGATIVE_THRESHOLD = -0.7;

  /** Threshold for extremely negative sentiment content */
  private readonly EXTREMELY_NEGATIVE_THRESHOLD = -0.9;

  /**
   * Regular expressions for detecting suspicious content patterns
   * @private
   * @readonly
   * @type {RegExp[]}
   * @description Patterns detect:
   * - Adult/NSFW domain patterns
   * - Onion/dark web URLs
   * - Adult service advertisements
   * - Age-restricted content markers
   * - Suspicious transaction patterns
   * - Cryptocurrency payment patterns
   */
  private readonly SUSPICIOUS_PATTERNS = [
    /\b(?:www\.)?[a-z0-9-]+\.(?:xxx|adult|porn)\b/i,
    /\.onion\b/i,
    /\b(?:escort|adult[\s-]massage)\s*services?\b/i,
    /\b(?:18\+\s*(?:explicit|only))\b/i,
    /\b(?:buy|sell|trade)\s*(?:adult\s*)?(?:pic|video|content)\b/i,
    /(?:crypto|bitcoin|payment)\s*(?:for|to)\s*(?:content|service)/i,
  ];

  /**
   * Keyword combinations that indicate potentially unsafe content
   * @private
   * @readonly
   * @type {string[][]}
   * @description Arrays of keyword combinations that may indicate:
   * - Private content transactions
   * - Content-for-payment schemes
   * - Cryptocurrency transactions
   * - Content trading arrangements
   */
  private readonly KEYWORD_COMBINATIONS = [
    ['private', 'show', 'payment'],
    ['send', 'pic', 'money'],
    ['buy', 'content', 'private'],
    ['trade', 'content', 'direct'],
    ['crypto', 'content', 'private'],
  ];

  /**
   * Creates a new ContentValidator instance
   * @constructor
   * @param {any} sentimentAnalyzer - Sentiment analysis implementation
   * @param {any} genAI - AI model interface for safety checks
   * @param {any} safetySettings - Safety settings for AI model
   */
  constructor(
    sentimentAnalyzer: any,
    private readonly genAI: any,
    private readonly safetySettings: any,
  ) {
    this.contentFilter = ContentFilter.getInstance();
    this.sentimentAnalyzer = sentimentAnalyzer;
  }

  /**
   * Validates content safety and appropriateness
   * @async
   * @param {string} content - Content to validate
   * @returns {Promise<{isValid: boolean, reason?: string, flags?: string[]}>} Validation result containing:
   * - isValid: Whether content passed all safety checks
   * - reason: Human readable explanation if content is invalid
   * - flags: Array of specific safety flags triggered
   * @throws {Error} If validation process fails
   * @description Performs comprehensive content validation:
   * 1. Checks for empty/invalid content
   * 2. Validates against restricted domains
   * 3. Checks for suspicious patterns
   * 4. Analyzes keyword combinations
   * 5. Performs sentiment analysis
   * 6. Runs AI safety verification
   */
  public async validateAIResponse(content: string): Promise<{
    isValid: boolean;
    reason?: string;
    flags?: string[];
  }> {
    try {
      const flags: string[] = [];

      if (!content?.trim()) {
        return { isValid: false, reason: 'Empty content' };
      }

      const nsfwDomainCheck = await this.contentFilter.isRestricted(content);
      if (nsfwDomainCheck) {
        flags.push('restricted_domain');
      }

      const normalizedContent = content.toLowerCase();
      const containsSuspiciousPatterns = this.SUSPICIOUS_PATTERNS.some((pattern) => {
        const matches = normalizedContent.match(pattern);
        if (!matches) return false;

        const contextWindow = 10;
        const words = normalizedContent.split(/\s+/);
        const matchIndex = words.findIndex((word) => pattern.test(word));

        if (matchIndex === -1) return false;

        const start = Math.max(0, matchIndex - contextWindow);
        const end = Math.min(words.length, matchIndex + contextWindow);
        const context = words.slice(start, end).join(' ');

        return this.isContextSuspicious(context);
      });

      if (containsSuspiciousPatterns) {
        flags.push('suspicious_patterns');
      }

      const hasKeywordCombinations = this.KEYWORD_COMBINATIONS.some((combination) =>
        combination.every((word) => normalizedContent.includes(word)),
      );

      if (hasKeywordCombinations) {
        flags.push('keyword_combinations');
      }

      const words = content.toLowerCase().split(' ');
      const sentimentScore = await this.sentimentAnalyzer.getSentiment(words);

      if (sentimentScore < this.EXTREMELY_NEGATIVE_THRESHOLD) {
        flags.push('extremely_negative_sentiment');
      } else if (sentimentScore < this.NEGATIVE_THRESHOLD) {
        flags.push('negative_sentiment');
      }

      try {
        const safetyPrompt = `Analyze if this content is safe and appropriate. Response must be exactly "SAFE" or "UNSAFE": ${content.substring(0, 1000)}`;
        const safetyCheck = await this.genAI.models.generateContent({
          model: gemini_model.model,
          contents: [{ parts: [{ text: safetyPrompt }] }],
          config: {
            responseModalities: ['TEXT'],
            safetySettings: [...this.safetySettings],
          },
        });
        const safetyResponse = safetyCheck.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!safetyResponse) {
          throw new Error('No AI text returned');
        }

        if (safetyResponse === 'unsafe') {
          flags.push('ai_safety_check');
        }
      } catch (aiError) {
        console.warn('AI safety check failed:', aiError);
      }

      return {
        isValid: flags.length === 0,
        flags: flags.length > 0 ? flags : undefined,
        reason: flags.length > 0 ? this.constructReason(flags) : undefined,
      };
    } catch (error) {
      console.error('Content validation failed:', error);
      return {
        isValid: false,
        reason: 'Validation error: ' + (error instanceof Error ? error.message : String(error)),
        flags: ['validation_error'],
      };
    }
  }

  /**
   * Checks if content context is suspicious
   * @private
   * @param {string} context - Content context to analyze
   * @returns {boolean} True if context matches suspicious patterns
   * @description Analyzes content context for:
   * - Payment/money requirement patterns
   * - Private/secret content patterns
   * - Adult/explicit content markers
   */
  private isContextSuspicious(context: string): boolean {
    const suspiciousContextPatterns = [
      /(?:payment|money|crypto)\s+(?:required|needed|only)/i,
      /(?:private|secret)\s+(?:content|message|dm)/i,
      /(?:adult|xxx)\s+(?:content|material)/i,
    ];

    return suspiciousContextPatterns.some((pattern) => pattern.test(context));
  }

  /**
   * Constructs human-readable reason from validation flags
   * @private
   * @param {string[]} flags - Array of validation flags
   * @returns {string} Concatenated human-readable reason string
   * @description Maps validation flags to readable descriptions and
   * combines them into a semicolon-separated string
   */
  private constructReason(flags: string[]): string {
    const reasons = {
      restricted_domain: 'Contains restricted domain',
      inappropriate_content: 'Contains inappropriate content',
      suspicious_patterns: 'Contains suspicious patterns',
      keyword_combinations: 'Contains suspicious keyword combinations',
      extremely_negative_sentiment: 'Contains extremely negative sentiment',
      negative_sentiment: 'Contains negative sentiment',
      ai_safety_check: 'Flagged by AI safety check',
      validation_error: 'Validation error occurred',
    };

    const flagReasons = flags.map((flag) => reasons[flag as keyof typeof reasons]).filter(Boolean);

    return flagReasons.join('; ');
  }
}

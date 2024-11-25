import { gemini_model } from '../constants/gemini-settings.js';
import { ContentFilter } from './scraper.js';

export class ContentValidator {
  private readonly contentFilter: ContentFilter;
  private readonly sentimentAnalyzer: any;
  private readonly NEGATIVE_THRESHOLD = -0.7;
  private readonly EXTREMELY_NEGATIVE_THRESHOLD = -0.9;

  private readonly SUSPICIOUS_PATTERNS = [
    /\b(?:www\.)?[a-z0-9-]+\.(?:xxx|adult|porn)\b/i,
    /\.onion\b/i,
    /\b(?:escort|adult[\s-]massage)\s*services?\b/i,
    /\b(?:18\+\s*(?:explicit|only))\b/i,
    /\b(?:buy|sell|trade)\s*(?:adult\s*)?(?:pic|video|content)\b/i,
    /(?:crypto|bitcoin|payment)\s*(?:for|to)\s*(?:content|service)/i,
  ];

  private readonly KEYWORD_COMBINATIONS = [
    ['private', 'show', 'payment'],
    ['send', 'pic', 'money'],
    ['buy', 'content', 'private'],
    ['trade', 'content', 'direct'],
    ['crypto', 'content', 'private'],
  ];

  constructor(
    sentimentAnalyzer: any,
    private readonly genAI: any,
    private readonly safetySettings: any,
  ) {
    this.contentFilter = ContentFilter.getInstance();
    this.sentimentAnalyzer = sentimentAnalyzer;
  }

  /**
   * Validates if content is safe and appropriate
   * @param content Content to validate
   * @returns Validation result with reason if invalid
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
        const model = await this.genAI.getGenerativeModel({
          model: gemini_model.model,
          safetySettings: this.safetySettings,
        });

        const safetyPrompt = `Analyze if this content is safe and appropriate. Response must be exactly "SAFE" or "UNSAFE": ${content.substring(0, 1000)}`;
        const safetyCheck = await model.generateContent(safetyPrompt);
        const safetyResponse = safetyCheck.response.text().toLowerCase().trim();

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

  private isContextSuspicious(context: string): boolean {
    const suspiciousContextPatterns = [
      /(?:payment|money|crypto)\s+(?:required|needed|only)/i,
      /(?:private|secret)\s+(?:content|message|dm)/i,
      /(?:adult|xxx)\s+(?:content|material)/i,
    ];

    return suspiciousContextPatterns.some((pattern) => pattern.test(context));
  }

  /**
   * Constructs a human-readable reason from flags
   * @private
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

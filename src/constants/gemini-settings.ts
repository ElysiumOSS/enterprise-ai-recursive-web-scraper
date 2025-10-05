/**
 * @fileoverview Configuration settings for Google's Gemini AI model integration
 * @module gemini-settings
 * @description Provides configuration constants and settings for interacting with the Gemini AI API,
 * including model selection, API authentication, and content safety thresholds
 */

import { GoogleGenAI, HarmBlockThreshold, HarmCategory, type Model } from '@google/genai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Model configuration parameters
 */
interface ModelParams {
  readonly model: string;
}

/**
 * Custom error for validation failures
 */
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Custom error for API-related failures
 */
class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly provider?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default fallback model when auto-detection fails
 */
const DEFAULT_MODEL = 'gemini-1.5-flash';

/**
 * Pattern for validating Gemini API keys
 */
const API_KEY_PATTERN = /^AIza[0-9A-Za-z\-_]{35}$/;

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validates the format of a Gemini API key
 * @param apiKey - The API key to validate
 * @returns True if the API key matches the expected format
 */
function isValidApiKey(apiKey: string): boolean {
  return API_KEY_PATTERN.test(apiKey);
}

// ============================================================================
// Model Selection
// ============================================================================

/**
 * Retrieves the latest available free Gemini model
 * @param apiKey - Google AI API key for authentication
 * @returns Promise resolving to model parameters with the latest free model
 * @throws {ValidationError} If the API key format is invalid
 * @throws {ApiError} If the API request fails
 * @example
 * ```typescript
 * const model = await getLatestFreeModel(API_KEY);
 * console.log(model.model); // "gemini-2.0-flash"
 * ```
 */
async function getLatestFreeModel(apiKey: string): Promise<ModelParams> {
  if (!isValidApiKey(apiKey)) {
    throw new ValidationError('Invalid Gemini API key format');
  }

  try {
    const genAI = new GoogleGenAI({ apiKey });
    const modelsPager = await genAI.models.list();

    // Collect all available models
    const allModels: Model[] = [];
    for await (const model of modelsPager) {
      allModels.push(model);
    }

    // Filter for free models (flash models, excluding pro variants)
    const freeModels = allModels.filter(
      (model: Model) => model.name?.includes('flash') && !model.name?.includes('pro'),
    );

    // Sort by version number (newest first)
    freeModels.sort((a: Model, b: Model) => {
      const extractVersion = (name?: string): number => {
        if (!name) return 0;
        const match = name.match(/(\d+\.?\d*)/g);
        return match ? parseFloat(match.join('.')) : 0;
      };
      return extractVersion(b.name) - extractVersion(a.name);
    });

    // Return latest model or fallback to default
    if (freeModels.length === 0) {
      console.warn(`No free models found, falling back to ${DEFAULT_MODEL}`);
      return { model: DEFAULT_MODEL };
    }

    const modelName = freeModels[0].name?.replace('models/', '') || DEFAULT_MODEL;
    console.info(`Selected Gemini model: ${modelName}`);
    return { model: modelName };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ApiError(`Failed to fetch Gemini models: ${errorMessage}`, undefined, 'Gemini API');
  }
}

/**
 * Google AI API key loaded from environment variables
 * @constant {string}
 * @description API key for authenticating with Google's AI services
 * @throws Logs a warning if the API key is not configured
 */
export const API_KEY = process.env.GOOGLE_AI_API_KEY;

if (!API_KEY) {
  console.warn(
    'GOOGLE_AI_API_KEY not found in environment variables. Please configure it in your .env file.',
  );
}

/**
 * The specific Gemini model version to use
 * @constant {ModelParams}
 * @description Defaults to Gemini 1.5 Pro. Use getLatestFreeModel() for automatic selection
 */
export const gemini_model: ModelParams = {
  model: await getLatestFreeModel(API_KEY).then((m) => m.model),
};

/**
 * Initialized Google Generative AI client
 * @constant {GoogleGenAI}
 * @description Main client instance for interacting with Gemini AI services
 */
export const genAI = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Generation configuration settings
 * @constant {undefined}
 * @description Can be configured to specify generation parameters:
 * - temperature: Controls randomness (0.0-1.0)
 * - topK: Limits token selection to top K options
 * - topP: Nucleus sampling threshold
 * - maxOutputTokens: Maximum length of generated response
 */
export const generationConfig = undefined;

/**
 * Content safety threshold settings
 * @constant {Array<{category: HarmCategory, threshold: HarmBlockThreshold}>}
 * @description Configures content filtering thresholds for different harm categories.
 * Current settings use BLOCK_NONE for maximum permissiveness.
 *
 * Categories:
 * - HARASSMENT: Content that harasses or bullies
 * - HATE_SPEECH: Content promoting hate or violence
 * - SEXUALLY_EXPLICIT: Explicit sexual content
 * - DANGEROUS_CONTENT: Content promoting dangerous activities
 *
 * @warning Using BLOCK_NONE disables safety filters. Consider stricter thresholds for production.
 */
export const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
] as const satisfies {
  category: HarmCategory;
  threshold: HarmBlockThreshold;
}[];

export { ApiError, getLatestFreeModel, isValidApiKey, ValidationError };

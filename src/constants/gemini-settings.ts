/**
 * @fileoverview Configuration settings for Google's Gemini AI model integration
 * @module gemini-settings
 * @description Provides configuration constants and settings for interacting with the Gemini AI API,
 * including model selection, API authentication, and content safety thresholds
 */

import {
	GoogleGenerativeAI,
	HarmBlockThreshold,
	HarmCategory,
	type ModelParams
} from "@google/generative-ai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * The specific Gemini model version to use
 * @constant {string}
 * @description Specifies the Gemini 1.5 Flash model, optimized for fast inference
 */
export const gemini_model: ModelParams = {
	model: "gemini-1.5-pro",
};

/**
 * Google AI API key loaded from environment variables
 * @constant {string}
 * @description API key for authenticating with Google's AI services. Falls back to empty string if not configured
 */
export const API_KEY = process.env.GOOGLE_AI_API_KEY || "";

/**
 * Initialized Google Generative AI client
 * @constant {GoogleGenerativeAI}
 * @description Main client instance for interacting with Gemini AI services
 */
export const genAI = new GoogleGenerativeAI(API_KEY || "");

/**
 * Generation configuration settings
 * @constant {undefined}
 * @description Currently undefined, can be used to specify generation parameters like temperature, top-k, etc.
 */
export const generationConfig = undefined;

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
];

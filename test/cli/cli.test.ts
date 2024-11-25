import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { fail } from "node:assert";

dotenv.config();

interface CliError {
  stderr: Buffer;
  exitCode: number;
}

describe("CLI", () => {
  const CLI_PATH = path.join(__dirname, '../../src/cli.ts');
  const TEST_URL = "https://headstarter.co";
  const TEST_OUTPUT = path.resolve(process.cwd(), "test-output");
  const TEST_API_KEY = process.env.GOOGLE_AI_API_KEY;
  const TEST_TIMEOUT = 60000;

  beforeEach(() => {
    try {
      if (!fs.existsSync(TEST_OUTPUT)) {
        fs.mkdirSync(TEST_OUTPUT, { recursive: true });
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create test directory: ${error.message}`);
      }
      throw error;
    }
  });

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      if (fs.existsSync(TEST_OUTPUT)) {
        fs.rmSync(TEST_OUTPUT, { recursive: true, force: true });
      }
    } catch (error) {
      if (error instanceof Error) {
        console.warn('Failed to clean up test directory:', error.message);
      } else {
        console.warn('Failed to clean up test directory:', error);
      }
    }
  });

  test("shows help when no arguments provided", async () => {
    try {
      const proc = await $`bun "${CLI_PATH}" --help`;
      expect(proc.stdout.toString()).toContain('Usage:');
    } catch (error) {
      const { stderr } = error as CliError;
      fail(`Help command failed: ${stderr}`);
    }
  }, TEST_TIMEOUT);

  test("validates required arguments", async () => {
    try {
      await $`bun "${CLI_PATH}" --url "${TEST_URL}"`;
      fail('Should have thrown error');
    } catch (error) {
      const { stderr } = error as CliError;
      expect(stderr.toString()).toContain('required option');
    }
  }, TEST_TIMEOUT);

  test("handles invalid URLs", async () => {
    try {
      await $`bun "${CLI_PATH}" --api-key "${TEST_API_KEY}" --url "invalid-url"`;
      fail('Should have thrown error');
    } catch (error) {
      const { stderr, exitCode } = error as CliError;
      expect(stderr.toString()).toContain('Invalid URL');
      expect(exitCode).toBe(1);
    }
  });

  test("handles standard scraping", async () => {
    const outputPath = path.resolve(TEST_OUTPUT);
    const start = Date.now();

    try {
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      const scrapePromise = $`bun "${CLI_PATH}" --api-key "${TEST_API_KEY}" --url "${TEST_URL}" --output "${outputPath}" --format json`.then((s) => setTimeout(() => s, TEST_TIMEOUT));

      const checkInterval = setInterval(() => {
        if (fs.existsSync(outputPath)) {
          const files = fs.readdirSync(outputPath);
          if (files.length > 0) {
            console.log(`Files generated: ${files.join(', ')}`);
            clearInterval(checkInterval);
          }
        }
      }, 1000);

      await scrapePromise;
      clearInterval(checkInterval);

      expect(fs.existsSync(outputPath)).toBe(true);
      const files = fs.readdirSync(outputPath);
      expect(files.length).toBeGreaterThan(0);

    } catch (error) {
      if (fs.existsSync(outputPath)) {
        const files = fs.readdirSync(outputPath);
        if (files.length > 0) {
          console.log('Files were generated despite error:', files);
          return;
        }
      }
      throw error;
    }
  }, TEST_TIMEOUT);
});

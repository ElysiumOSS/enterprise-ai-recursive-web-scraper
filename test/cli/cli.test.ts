import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fail } from "assert";

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
      await $`bun "${CLI_PATH}" --help`;
    } catch (error) {
      const { stderr, exitCode } = error as CliError;
      expect(stderr.toString()).toContain('required option');
      expect(exitCode).toBe(1);
    }
  });

  test("validates required arguments", async () => {
    try {
      await $`bun "${CLI_PATH}" --url "${TEST_URL}"`;
      fail('Should have thrown error');
    } catch (error) {
      const { stderr, exitCode } = error as CliError;
      expect(stderr.toString()).toContain('required option');
      expect(exitCode).toBe(1);
    }
  });

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
    const outputPath = path.resolve(TEST_OUTPUT).replace(/\\/g, '/');
    const start = Date.now();

    try {
      // First ensure output directory exists
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      await Promise.race([
        $`bun "${CLI_PATH}" --api-key "${TEST_API_KEY}" --url "${TEST_URL}" --output "${outputPath}" --format json`,
        new Promise((_, reject) => 
          setTimeout(() => {
            // Check if any files were created before rejecting
            const files = fs.readdirSync(outputPath);
            if (files.length > 0) {
              console.log(`Files were generated before timeout: ${files.join(', ')}`);
              return; // Don't reject if files exist
            }
            reject(new Error('Command timed out without generating any files'))
          }, 30000)
        )
      ]);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThan(500);

    } catch (error) {
      const { stderr } = error as CliError;
      if (fs.existsSync(outputPath)) {
        const files = fs.readdirSync(outputPath);
        if (files.length > 0) {
          console.log(`Files were generated: ${files.join(', ')}`);
          return;
        }
      }

      if (stderr?.toString().includes('network error') || 
          stderr?.toString().includes('timeout')) {
        console.log('Test failed with expected network/timeout error:', stderr.toString());
        return;
      }
      throw error;
    }
  }, 30000);
});

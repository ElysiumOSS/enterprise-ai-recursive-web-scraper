import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

describe("CLI", () => {
  const CLI_PATH = path.join(__dirname, '../../lib/cli.js');
  const TEST_URL = "https://headstarter.co";
  const TEST_OUTPUT = path.resolve(process.cwd(), "test-output");
  const TEST_API_KEY = process.env.GOOGLE_AI_API_KEY;

  beforeEach(() => {
    if (!fs.existsSync(TEST_OUTPUT)) fs.mkdirSync(TEST_OUTPUT, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_OUTPUT)) fs.rmSync(TEST_OUTPUT, { recursive: true });
  });

  test("shows help when no arguments provided", async () => {
    const output = await $`bun "${CLI_PATH}"`;
    expect(output.toString()).toContain("Usage:");
  });

  test("validates required arguments", async () => {
    try {
      await $`bun "${CLI_PATH}" --url ${TEST_URL}`;
    } catch (error: any) {
      const stderr = error.stderr.toString();
      expect(error.exitCode).toBe(1);
      expect(stderr).toContain("required option");
    }
  });

  test("runs scraper with valid arguments", async () => {
    const cmd = `bun "${CLI_PATH}" --api-key "${TEST_API_KEY}" --url "${TEST_URL}" --output "${TEST_OUTPUT}" --format json`;
    const output = await $`${cmd}`;
    expect(output.toString()).toContain("Scraping completed successfully");

    const files = fs.readdirSync(TEST_OUTPUT);
    expect(files).toContain("scraping-report.json");
  });

  test("handles invalid URLs", async () => {
    try {
      await $`bun "${CLI_PATH}" --api-key "${TEST_API_KEY}" --url invalid-url`;
    } catch (error: any) {
      expect(error.stderr.toString()).toContain("Invalid URL");
    }
  });

  test("respects rate limiting", async () => {
    const start = Date.now();
    
    const cmd = `bun "${CLI_PATH}" --api-key "${TEST_API_KEY}" --url "${TEST_URL}" --output "${TEST_OUTPUT}" --format json --rate-limit 2`;
    await $`${cmd}`;
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThan(500);
  });
});

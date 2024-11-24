#!/usr/bin/env node

import { Command } from 'commander';
import ora, { Ora } from 'ora';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import winston from 'winston';
import Table from 'cli-table3';
import prettyBytes from 'pretty-bytes';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Define types for dynamic imports
type ChalkType = typeof import('chalk').default;
type WebScraperType = typeof import('./classes/web.js').WebScraper;

// Initialize variables for dynamically imported modules
let chalk: ChalkType;
let WebScraper: WebScraperType;

dotenv.config();
const __filename = fileURLToPath(new URL(import.meta.url).href);
const __dirname = dirname(__filename);

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Add console transport if not in production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

class ScraperCLI {
  private program: Command;
  private spinner: Ora;

  constructor() {
    this.program = new Command();
    this.spinner = ora();
    this.configureProgram();
  }

  configureProgram() {
    this.program
      .name('web-scraper')
      .description('AI-powered recursive web scraper with advanced features')
      .version('1.0.4')
      .requiredOption('-k, --api-key <key>', 'Google Gemini API key')
      .requiredOption('-u, --url <url>', 'URL to scrape')
      .option('-o, --output <directory>', 'Output directory', 'scraping_output')
      .option('-d, --depth <number>', 'Maximum crawl depth', '3')
      .option('-c, --concurrency <number>', 'Concurrent scraping limit', '5')
      .option('-t, --timeout <seconds>', 'Request timeout in seconds', '30')
      .option('-f, --format <type>', 'Output format (json|csv|markdown)', 'json')
      .option('--screenshot', 'Capture screenshots of pages', false)
      .option('--no-headless', 'Run browser in non-headless mode')
      .option('--proxy <url>', 'Use proxy server')
      .option('-v, --verbose', 'Enable verbose logging')
      .option('--config <path>', 'Path to config file');
  }

  async loadConfig(configPath: string) {
    try {
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      return config;
    } catch (error) {
      logger.error(`Failed to load config file: ${error instanceof Error ? error.message : String(error)}`);
      return {};
    }
  }

  validateOptions(options: any) {
    const requiredOptions = {
      url: options.url,
      depth: options.depth,
      concurrency: options.concurrency,
      timeout: options.timeout
    };

    // Validate URL format
    try {
      new URL(requiredOptions.url);
    } catch (error) {
      throw new Error(`Invalid URL: ${requiredOptions.url}`);
    }

    // Validate numeric values
    const depth = parseInt(requiredOptions.depth);
    if (isNaN(depth) || depth < 1) {
      throw new Error('Depth must be a positive number');
    }

    const concurrency = parseInt(requiredOptions.concurrency);
    if (isNaN(concurrency) || concurrency < 1) {
      throw new Error('Concurrency must be a positive number');
    }

    const timeout = parseInt(requiredOptions.timeout);
    if (isNaN(timeout) || timeout < 1) {
      throw new Error('Timeout must be a positive number');
    }
  }

  async ensureOutputDirectory(directory: string) {
    try {
      await fs.mkdir(directory, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create output directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  createResultsTable(results: Map<string, any>) {
    const table = new Table({
      head: ['URL', 'Status', 'Size', 'Processing Time', 'Links Found'],
      style: { head: ['cyan'] }
    });

    for (const [url, result] of results.entries()) {
      const status = result.error ? chalk.red('Failed') : chalk.green('Success');
      const size = result.error ? '-' : prettyBytes(result.contentSize || 0);
      const time = result.error ? '-' : `${result.processingTime}ms`;
      const links = result.error ? '-' : result.foundLinks?.length || 0;

      table.push([url, status, size, time, links]);
    }

    return table.toString();
  }

  async exportResults(
    results: Map<string, any>,
    format: string,
    outputDir: string
  ) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `scraping-results-${timestamp}`;

    switch (format.toLowerCase()) {
      case 'json':
        await fs.writeFile(
          path.join(outputDir, `${filename}.json`),
          JSON.stringify([...results], null, 2)
        );
        break;
      case 'csv':
        const csv = this.convertToCSV(results);
        await fs.writeFile(path.join(outputDir, `${filename}.csv`), csv);
        break;
      case 'markdown':
        const markdown = this.convertToMarkdown(results);
        await fs.writeFile(path.join(outputDir, `${filename}.md`), markdown);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  convertToCSV(results: Map<string, any>) {
    const headers = ['URL', 'Status', 'Content Size', 'Processing Time', 'Links Found', 'Error'];
    const rows = [...results].map(([url, result]) => [
      url,
      result.error ? 'Failed' : 'Success',
      result.contentSize || '',
      result.processingTime || '',
      result.foundLinks?.length || '',
      result.error || ''
    ]);
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  convertToMarkdown(results: Map<string, any>) {
    const headers = ['URL', 'Status', 'Content Size', 'Processing Time', 'Links Found', 'Error'];
    const separator = headers.map(() => '---').join('|');
    const rows = [...results].map(([url, result]) => [
      url,
      result.error ? '❌ Failed' : '✅ Success',
      result.contentSize ? prettyBytes(result.contentSize) : '-',
      result.processingTime ? `${result.processingTime}ms` : '-',
      result.foundLinks?.length || '-',
      result.error || '-'
    ]);
    
    return [
      headers.join('|'),
      separator,
      ...rows.map(row => row.join('|'))
    ].join('\n');
  }

  async run() {
    try {
      // Dynamically import chalk
      const chalkModule = await import('chalk');
      chalk = chalkModule.default;

      this.program.parse(process.argv);
      const options = this.program.opts();

      // Load config file if specified
      if (options.config) {
        const configOptions = await this.loadConfig(options.config);
        Object.assign(options, configOptions);
      }

      this.validateOptions(options);
      await this.ensureOutputDirectory(options.output);

      // Configure verbose logging
      if (options.verbose) {
        logger.level = 'debug';
      }

      // Dynamically import WebScraper
      const { WebScraper: ImportedWebScraper } = await import('./classes/web.js');
      WebScraper = ImportedWebScraper;

      // Initialize scraper with options
      const scraper = new WebScraper({
        outputDir: options.output,
        maxDepth: parseInt(options.depth),
        concurrency: parseInt(options.concurrency),
        timeout: parseInt(options.timeout) * 1000,
        headless: options.headless !== false,
        screenshot: options.screenshot,
        proxy: options.proxy
      } as any);

      // Start scraping
      this.spinner.start('Initializing scraper...');
      logger.info('Starting scraping process', { url: options.url, options });

      const startTime = Date.now();
      const results = await scraper.scrapeWebsite(options.url);
      const duration = Date.now() - startTime;

      // Export results
      await this.exportResults(results, options.format, options.output);

      // Display results
      this.spinner.succeed('Scraping completed successfully!');
      console.log('\nScraping Summary:');
      console.log(this.createResultsTable(results));
      console.log(`\nTotal time: ${duration / 1000}s`);
      console.log(`Results exported to: ${options.output}`);

      logger.info('Scraping completed', {
        duration,
        totalUrls: results.size,
        successCount: [...results.values()].filter(r => !r.error).length
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.spinner) {
        this.spinner.fail(chalk ? chalk.red('Scraping failed!') : 'Scraping failed!');
      }
      logger.error('Fatal error', { 
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      console.error(chalk ? chalk.red(`\nError: ${errorMessage}`) : `\nError: ${errorMessage}`);
      process.exit(1);
    }
  }
}

// Run CLI
const cli = new ScraperCLI();
cli.run();
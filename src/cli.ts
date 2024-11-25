#!/usr/bin/env node

import { Command } from 'commander';
import ora, { Ora } from 'ora';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs/promises';
import winston from 'winston';
import Table from 'cli-table3';
import prettyBytes from 'pretty-bytes';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { RateLimiter } from './classes/web.js';

type ChalkType = typeof import('chalk').default;
type WebScraperType = typeof import('./classes/web.js').WebScraper;

interface ScraperOptions {
  url: string;
  depth: string;
  concurrency: string;
  timeout: string;
  output: string;
  format: string;
  apiKey: string;
  verbose?: boolean;
  config?: string;
  retryAttempts: string;
  retryDelay: string;
  memoryLimit: string;
}

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class FileSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileSystemError';
  }
}

class ScrapingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScrapingError';
  }
}

let chalk: ChalkType;
let WebScraper: WebScraperType;

dotenv.config();
const __filename = fileURLToPath(new URL(import.meta.url).href);
const __dirname = dirname(__filename);

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
  private rateLimiter: RateLimiter;

  constructor() {
    this.program = new Command();
    this.spinner = ora();
    this.rateLimiter = new RateLimiter(5, 1);
    this.configureProgram();

    // Handle process termination
    process.on('SIGINT', () => {
      console.log('\nReceived SIGINT. Cleaning up...');
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\nReceived SIGTERM. Cleaning up...');
      this.cleanup();
      process.exit(0);
    });

    process.on('unhandledRejection', (error) => {
      console.error('Unhandled promise rejection:', error);
      this.cleanup();
      process.exit(1);
    });
  }

  cleanup() {
    if (this.spinner) {
      this.spinner.stop();
    }
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
      .option('--config <path>', 'Path to config file')
      .option('-r, --rate-limit <number>', 'Rate limit (requests per second)', '5')
      .option('--retry-attempts <number>', 'Number of retry attempts', '3')
      .option('--retry-delay <number>', 'Delay between retries (ms)', '1000')
      .option('--memory-limit <number>', 'Memory limit in MB', '1024');
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

  validateOptions(options: ScraperOptions) {
    const requiredOptions = {
      url: options.url,
      depth: options.depth,
      concurrency: options.concurrency,
      timeout: options.timeout
    };

    try {
      new URL(requiredOptions.url);
    } catch (error) {
      throw new Error(`Invalid URL: ${requiredOptions.url}`);
    }

    const depth = Number.parseInt(requiredOptions.depth);
    if (Number.isNaN(depth) || depth < 1) {
      throw new Error('Depth must be a positive number');
    }

    const concurrency = Number.parseInt(requiredOptions.concurrency);
    if (Number.isNaN(concurrency) || concurrency < 1) {
      throw new Error('Concurrency must be a positive number');
    }

    const timeout = Number.parseInt(requiredOptions.timeout);
    if (Number.isNaN(timeout) || timeout < 1) {
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

  private createResultsTable(results: Map<string, any>): string {
    if (!chalk) {
      throw new Error('Chalk is not initialized');
    }

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

  async exportResults(results: Map<string, any>, format: string, outputDir: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `scraping-results-${timestamp}`;

    switch (format.toLowerCase()) {
      case 'json':
        await fs.writeFile(
          path.join(outputDir, `${filename}.json`),
          JSON.stringify([...results], null, 2)
        );
        break;
      case 'csv': {
        const csv = this.convertToCSV(results);
        await fs.writeFile(path.join(outputDir, `${filename}.csv`), csv);
        break;
      }
      case 'markdown': {
        const markdown = this.convertToMarkdown(results);
        await fs.writeFile(path.join(outputDir, `${filename}.md`), markdown);
        break;
      }
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

  private async withRetry<T>(
    operation: () => Promise<T>,
    options: { attempts: number; delay: number; name: string }
  ): Promise<T> {
    if (!chalk) {
      throw new Error('Chalk is not initialized');
    }

    for (let attempt = 1; attempt <= options.attempts; attempt++) {
      try {
        await this.rateLimiter.acquire();
        return await operation();
      } catch (error) {
        if (attempt === options.attempts) throw error;
        
        const waitTime = options.delay * attempt;
        this.spinner.text = chalk.yellow(
          `Attempt ${attempt} failed for ${options.name}. Retrying in ${waitTime}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    throw new Error(`Failed after ${options.attempts} attempts`);
  }

  async run() {
    try {
      const chalkModule = await import('chalk');
      chalk = chalkModule.default;

      this.program.parse(process.argv);
      const options = this.program.opts();

      const memoryLimit = parseInt(options.memoryLimit) * 1024 * 1024;
      process.setMaxListeners(memoryLimit);

      if (options.config) {
        const configOptions = await this.withRetry(
          () => this.loadConfig(options.config),
          { attempts: 3, delay: 1000, name: 'config loading' }
        );
        Object.assign(options, configOptions);
      }

      this.validateOptions(options as ScraperOptions);
      await this.ensureOutputDirectory(options.output);

      if (options.verbose) {
        logger.level = 'debug';
      }

      const scraper = new (await import('./classes/web.js')).WebScraper({
        ...options,
        retryOptions: {
          maxRetries: parseInt(options.retryAttempts),
          retryDelay: parseInt(options.retryDelay)
        }
      });

      this.spinner.start('Initializing scraper...');

      const startTime = Date.now();
      const results = await scraper.scrapeWebsite(options.url);
      const duration = Date.now() - startTime;

      this.spinner.text = 'Exporting results...';
      await this.exportResults(results, options.format, options.output);

      this.displaySummary(results, duration, options as ScraperOptions);

      logger.info('Scraping completed', {
        duration,
        totalUrls: results.size,
        successCount: [...results.values()].filter(r => !r.error).length,
        memoryUsage: process.memoryUsage()
      });

    } catch (error: unknown) {
      this.handleError(error);
    }
  }

  private displaySummary(results: Map<string, any>, duration: number, options: ScraperOptions): void {
    if (!chalk) {
      throw new Error('Chalk is not initialized');
    }

    this.spinner.succeed('Scraping completed successfully!');
    
    console.log('\n📊 Scraping Summary:');
    console.log(this.createResultsTable(results));
    
    const stats = this.calculateStats(results);
    console.log('\n📈 Performance Metrics:');
    console.log(`⏱️  Total time: ${(duration / 1000).toFixed(2)}s`);
    console.log(`🎯 Success rate: ${stats.successRate.toFixed(2)}%`);
    console.log(`📦 Total data processed: ${prettyBytes(stats.totalSize)}`);
    console.log(`💾 Results exported to: ${options.output}`);
  }

  private calculateStats(results: Map<string, any>) {
    const values = [...results.values()];
    const successful = values.filter(r => !r.error);

    return {
      successRate: (successful.length / values.length) * 100,
      totalSize: values.reduce((sum, r) => sum + (r.contentSize || 0), 0),
      avgProcessingTime: values.reduce((sum, r) => sum + (r.processingTime || 0), 0) / values.length
    };
  }

  private handleError(error: unknown): never {
    if (!chalk) {
      console.error('\nError:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (this.spinner) {
      this.spinner.fail(chalk.red('Scraping failed!'));
    }
    
    logger.error('Fatal error', { 
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    
    console.error(chalk.red(`\nError: ${errorMessage}`));
    process.exit(1);
  }
}

const cli = new ScraperCLI();
cli.run();
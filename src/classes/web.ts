import fs from 'node:fs/promises';
import path from 'node:path';
import { Sema } from 'async-sema';
import { LRUCache } from 'lru-cache';
import natural from 'natural';
import { type Browser, type Page, chromium } from 'playwright';
import { gemini_model, genAI, safetySettings } from '../constants/gemini-settings.js';
import { ContentAnalyzer, PromptGenerator } from './content-analyzer.js';
import { ContentValidator } from './content-validator.js';
import { ContentFilter, scrape } from './scraper.js';

interface RiskMetrics {
  securityScore: number;
  contentRisk: number;
  behaviorRisk: number;
  technicalRisk: number;
}

interface PageResult {
  url: string;
  contentPath: string;
  processedContentPath: string;
  screenshot: string;
  error?: string;
  timestamp: number;
  riskLevel?: RiskLevel;
  riskMetrics?: RiskMetrics;
}

enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

interface ScraperConfig {
  outputDir?: string;
  maxConcurrentPages?: number;
  maxDepth?: number;
  screenshotOptions?: {
    fullPage?: boolean;
    timeout?: number;
    scrollInterval?: number;
  };
  retryOptions?: {
    maxRetries: number;
    retryDelay: number;
  };
  cacheOptions?: {
    max: number;
    ttl: number;
  };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async <T>(fn: () => Promise<T>, retries = 3, baseDelay = 1000): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0 || !(error instanceof Error) || !error.message.includes('429')) {
      throw error;
    }

    await delay(baseDelay * Math.pow(2, 3 - retries));
    return withRetry(fn, retries - 1, baseDelay);
  }
};

export class RateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private lastRefill: number;

  constructor(maxTokens: number, refillRate: number) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    await this.refill();
    if (this.tokens <= 0) {
      const waitTime = 1000 / this.refillRate;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      await this.refill();
    }
    this.tokens--;
  }

  private async refill(): Promise<void> {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const refill = Math.floor((timePassed * this.refillRate) / 1000);
    this.tokens = Math.min(this.maxTokens, this.tokens + refill);
    this.lastRefill = now;
  }
}

export class WebScraper {
  private browser: Browser | null = null;
  private readonly results: LRUCache<string, PageResult>;
  private readonly processedUrls = new Set<string>();
  private readonly outputDir: string;
  private readonly maxConcurrentPages: number;
  private readonly contentFilter: ContentFilter;
  private readonly validator: ContentValidator;
  private readonly sentimentAnalyzer: natural.SentimentAnalyzer;
  private baseUrl = '';
  private readonly maxDepth: number;
  private readonly semaphore: Sema;
  private isShuttingDown = false;
  private readonly pagePool: Page[] = [];
  private readonly resultPromises = new Map<string, Promise<PageResult>>();
  private readonly timeouts = new Map<string, NodeJS.Timeout>();
  private readonly rateLimiter: RateLimiter;

  private static readonly TIMEOUTS = {
    navigation: 30000,
    processing: 60000,
    screenshot: 30000,
    browserLaunch: 120000,
    retryDelay: 5000,
  };

  private static readonly LAUNCH_CONFIG = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-features=TranslateUI,BlinkGenPropertyTrees',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--no-first-run',
      '--password-store=basic',
      '--use-mock-keychain',
      '--window-size=1920,1080',
    ],
    timeout: 120000,
    retries: 5,
    retryBackoff: true,
  };

  constructor(config: ScraperConfig = {}) {
    this.outputDir = config.outputDir ?? 'scraping_output';
    this.maxConcurrentPages = config.maxConcurrentPages ?? 5;
    this.maxDepth = config.maxDepth ?? 3;

    this.results = new LRUCache({
      max: config.cacheOptions?.max ?? 1000,
      ttl: config.cacheOptions?.ttl ?? 1000 * 60 * 60,
      updateAgeOnGet: true,
    });

    this.sentimentAnalyzer = new natural.SentimentAnalyzer(
      'English',
      natural.PorterStemmer,
      'pattern',
    );

    this.validator = new ContentValidator(this.sentimentAnalyzer, genAI, safetySettings);

    this.semaphore = new Sema(this.maxConcurrentPages);
    this.contentFilter = ContentFilter.getInstance();
    console.log('WebScraper initialized with config:', config);

    this.rateLimiter = new RateLimiter(5, 1);

    process.on('SIGINT', () => this.handleShutdown());
    process.on('SIGTERM', () => this.handleShutdown());
  }

  public async scrapeWebsite(url: string): Promise<Map<string, PageResult>> {
    console.log('Starting scrape for website:', url);
    if (!this.isValidUrl(url)) {
      console.error('Invalid URL provided:', url);
      throw new Error('Invalid URL provided');
    }

    this.baseUrl = new URL(url).origin;
    await this.initialize();

    try {
      await this.contentFilter.initialize();
      await this.processSinglePage(url, 0);
      console.log('Scraping completed for website:', url);
      return new Map(this.results.entries());
    } finally {
      await this.cleanup();
    }
  }

  private async initialize(): Promise<void> {
    console.log('Initializing browser and output directory...');
    await fs.mkdir(this.outputDir, { recursive: true });

    let lastError: Error | null = null;
    let retryDelay = WebScraper.LAUNCH_CONFIG.timeout / WebScraper.LAUNCH_CONFIG.retries;

    for (let attempt = 1; attempt <= WebScraper.LAUNCH_CONFIG.retries; attempt++) {
      try {
        console.log(`Browser launch attempt ${attempt}/${WebScraper.LAUNCH_CONFIG.retries}`);

        const cleanup = async () => {
          if (this.browser) {
            try {
              await this.browser.close();
            } catch (e) {
              console.warn('Failed to close browser:', e);
            }
            this.browser = null;
          }
        };

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            cleanup();
            reject(new Error('Browser launch timeout'));
          }, WebScraper.LAUNCH_CONFIG.timeout);
        });

        const browserPromise = chromium.launch({
          headless: WebScraper.LAUNCH_CONFIG.headless,
          args: WebScraper.LAUNCH_CONFIG.args,
          timeout: WebScraper.LAUNCH_CONFIG.timeout,
          env: {
            ...process.env,
            NODE_OPTIONS: '--max-old-space-size=4096',
          },
        });

        this.browser = await Promise.race([browserPromise, timeoutPromise]);
        await this.browser.contexts();

        console.log('Browser successfully initialized.');
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Browser launch attempt ${attempt} failed:`, lastError.message);

        if (attempt < WebScraper.LAUNCH_CONFIG.retries) {
          if (WebScraper.LAUNCH_CONFIG.retryBackoff) {
            retryDelay *= 1.5;
          }

          console.log(`Waiting ${retryDelay / 1000} seconds before retry...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }

        await this.cleanup().catch((cleanupError) =>
          console.warn('Failed to cleanup browser:', cleanupError),
        );
      }
    }

    throw new Error(
      `Failed to launch browser after ${WebScraper.LAUNCH_CONFIG.retries} attempts. ` +
        `Last error: ${lastError?.message}. ` +
        'Please check system resources and network connectivity.',
    );
  }

  private async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      await this.initialize();
    }

    if (!this.browser) {
      throw new Error('Browser initialization failed');
    }

    try {
      await Promise.race([
        this.browser.contexts(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Browser health check timeout')), 5000),
        ),
      ]);
      return this.browser;
    } catch (error) {
      console.warn('Browser became unresponsive, reinitializing...');
      await this.cleanup();
      await this.initialize();

      if (!this.browser) {
        throw new Error('Browser reinitialization failed');
      }

      return this.browser;
    }
  }

  private async getPage(): Promise<Page> {
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();

    await page.setDefaultTimeout(WebScraper.TIMEOUTS.navigation);
    await page.setDefaultNavigationTimeout(WebScraper.TIMEOUTS.navigation);

    return page;
  }

  private async releasePage(page: Page): Promise<void> {
    if (this.pagePool.length < this.maxConcurrentPages) {
      this.pagePool.push(page);
    } else {
      await page.close();
    }
  }

  private async processSinglePage(url: string, depth: number): Promise<PageResult> {
    if (this.isShuttingDown) {
      console.log('Scraper is shutting down, skipping:', url);
      return this.createErrorResult(url, 'Scraper shutdown');
    }

    if (depth > this.maxDepth) {
      console.log(`Max depth ${this.maxDepth} reached for: ${url}`);
      return this.createErrorResult(url, 'Max depth reached');
    }

    const urlObj = new URL(url);
    const sanitizedPath = this.generateRoutePath(urlObj);
    const dirPath = path.join(this.outputDir, sanitizedPath);

    try {
      await fs.access(dirPath);
      const files = await fs.readdir(dirPath);

      if (files.some((file) => file.startsWith('content_'))) {
        console.log(`Content already exists for ${url}, skipping processing`);
        const existingResult: PageResult = {
          url,
          contentPath: path.join(dirPath, files.find((f) => f.startsWith('content_')) || ''),
          processedContentPath: path.join(
            dirPath,
            files.find((f) => f.startsWith('processed_')) || '',
          ),
          screenshot: path.join(dirPath, files.find((f) => f.startsWith('screenshot_')) || ''),
          timestamp: Number(
            files
              .find((f) => f.startsWith('content_'))
              ?.split('_')[1]
              ?.split('.')[0] || Date.now(),
          ),
        };
        this.results.set(url, existingResult);
        return existingResult;
      }
    } catch {}

    const cachedResult = this.results.get(url);
    if (cachedResult) return cachedResult;

    if (this.resultPromises.has(url)) {
      return this.resultPromises.get(url)!;
    }

    const resultPromise = this.processPageInternal(url, depth);
    this.resultPromises.set(url, resultPromise);

    try {
      const result = await resultPromise;
      this.results.set(url, result);
      return result;
    } catch (error) {
      console.error(`Error processing ${url}:`, error);
      const errorResult = this.createErrorResult(
        url,
        error instanceof Error ? error.message : String(error),
      );
      this.results.set(url, errorResult);
      return errorResult;
    } finally {
      this.resultPromises.delete(url);
    }
  }

  private async processPageInternal(url: string, depth: number): Promise<PageResult> {
    if (this.isShuttingDown) {
      throw new Error('Scraper is shutting down');
    }

    await this.rateLimiter.acquire();

    if (this.processedUrls.has(url)) {
      console.log('URL already processed:', url);
      return this.results.get(url)!;
    }

    const timeoutId = setTimeout(() => {
      console.warn(`Processing timeout for ${url}, skipping...`);
      this.cleanup(url);
    }, WebScraper.TIMEOUTS.processing);

    this.timeouts.set(url, timeoutId as unknown as NodeJS.Timeout);

    try {
      console.log(`Attempting to acquire semaphore for URL: ${url}`);
      await this.semaphore.acquire();

      if (this.processedUrls.has(url)) {
        console.log('URL processed while waiting for semaphore:', url);
        return this.results.get(url)!;
      }

      this.processedUrls.add(url);

      const page = await this.getPage();
      await page.setDefaultNavigationTimeout(WebScraper.TIMEOUTS.navigation);

      try {
        const result = await this.processPage(page, url, depth);
        this.results.set(url, result);
        return result;
      } finally {
        await this.releasePage(page);
        this.cleanup(url);
      }
    } catch (error) {
      this.processedUrls.delete(url);
      this.cleanup(url);
      throw `${error instanceof Error ? error.message : error}`;
    }
  }

  private async cleanup(url?: string): Promise<void> {
    try {
      if (url) {
        const timeoutId = this.timeouts.get(url);
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.timeouts.delete(url);
        }
        this.semaphore.release();
        console.log(`Released semaphore for URL: ${url}`);
      } else {
        for (const [url, timeoutId] of this.timeouts) {
          clearTimeout(timeoutId);
          this.timeouts.delete(url);
        }

        if (this.browser) {
          await this.browser.close();
          this.browser = null;
        }

        this.pagePool.length = 0;

        this.processedUrls.clear();
        this.resultPromises.clear();
        this.timeouts.clear();
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error;
    }
  }

  private async processPage(page: Page, url: string, depth: number): Promise<PageResult> {
    const pageTimeout = setTimeout(() => {
      console.warn(`Page processing timeout for ${url}`);
      page.close().catch(console.error);
    }, WebScraper.TIMEOUTS.processing);

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: WebScraper.TIMEOUTS.navigation,
      });

      const links = await this.extractValidLinks(page);
      console.log(`Found ${links.length} valid links to process`);

      const result = await this.processPageContent(page, url);

      const batchSize = 3;
      for (let i = 0; i < links.length; i += batchSize) {
        const batch = links.slice(i, i + batchSize);
        await Promise.all(
          batch.map(
            (link) => !this.processedUrls.has(link) && this.processSinglePage(link, depth + 1),
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      return result;
    } finally {
      clearTimeout(pageTimeout);
    }
  }

  private async processPageContent(page: Page, url: string): Promise<PageResult> {
    try {
      console.log(`Processing page content for: ${url}`);

      await Promise.race([page.waitForLoadState('domcontentloaded'), page.waitForTimeout(10000)]);

      await page.waitForTimeout(2000);

      const [screenshotPath, content] = await Promise.all([
        this.takeScreenshot(page, url).catch((error) => {
          console.warn(`Screenshot failed for ${url}:`, error);
          return '';
        }),
        this.scrapeWithRetry(page).catch((error) => {
          console.warn(`Content scraping failed for ${url}:`, error);
          return null;
        }),
      ]);

      if (!content) {
        throw new Error(`Failed to scrape content for ${url}`);
      }

      const contentPath = await this.saveToFile(content, 'content', url);

      const processedContent = await this.processWithLLM(content, url);
      const processedContentPath = await this.saveToFile(processedContent, 'processed', url);

      return {
        url,
        contentPath,
        processedContentPath,
        screenshot: screenshotPath,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`Failed to process page ${url}:`, error);
      return this.createErrorResult(url, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async scrapeWithRetry(page: Page, maxRetries = 3): Promise<any> {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.rateLimiter.acquire();
        const { filteredTexts } = await scrape(page.url());
        if (filteredTexts && filteredTexts.length > 0) {
          return filteredTexts[0];
        }
      } catch (error) {
        console.warn(`Scrape attempt ${attempt} failed:`, error);
        lastError = error;
        await page.waitForTimeout(1000 * attempt);
      }
    }

    throw lastError || new Error('Failed to scrape content after retries');
  }

  private async extractValidLinks(page: Page): Promise<string[]> {
    const baseUrl = await page.evaluate(() => window.location.origin);

    const links = await Promise.race([
      page.evaluate(() => {
        const delay = Math.floor(Math.random() * 2000) + 1000;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve([
              ...new Set(
                Array.from(document.querySelectorAll('a[href]'))
                  .map((a) => (a as HTMLAnchorElement).href)
                  .filter((href) => href && !href.startsWith('javascript:')),
              ),
            ]);
          }, delay);
        });
      }),
      new Promise<string[]>((_, reject) =>
        setTimeout(() => reject(new Error('Link extraction timeout')), 10000),
      ),
    ]);

    return [
      ...new Set(
        (links as string[])
          .filter((link) => {
            try {
              return (
                this.isSameOrigin(link, this.baseUrl) &&
                !this.processedUrls.has(link) &&
                !this.isNonTextualFile(new URL(link).pathname)
              );
            } catch {
              return false;
            }
          })
          .map((link) => this.normalizeUrl(link, baseUrl))
          .filter((link) => link !== null) as string[],
      ),
    ];
  }

  private formatAsMarkdown(content: string, url: string, title?: string): string {
    const timestamp = new Date().toISOString();

    const frontmatter = `---
url: ${url}
date: ${timestamp}
title: ${title || 'Untitled Page'}
---

`;

    const formattedContent = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        if (line.match(/^[A-Z][A-Za-z0-9\s]{2,}$/)) {
          return `## ${line}`;
        }
        return line;
      })
      .join('\n\n');

    return `${frontmatter}
# ${title || 'Page Content'}

${formattedContent}

---
*Generated on: ${timestamp}*
*Source: ${url}*
`;
  }

  private isSameOrigin(url1: string, url2: string): boolean {
    try {
      const getDomain = (url: string) => {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
      };

      const domain1 = getDomain(url1);
      const domain2 = getDomain(url2);

      if (domain1 !== domain2) {
        console.debug(`Domains differ: ${domain1} !== ${domain2}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Error comparing origins: ${error}`);
      return false;
    }
  }

  private normalizeUrl(url: string, baseUrl: string): string | null {
    try {
      if (url.startsWith('#') || /^(mailto|tel|javascript):/i.test(url)) {
        return null;
      }

      const fullUrl = url.startsWith('//')
        ? `https:${url}`
        : url.includes('://')
          ? url
          : new URL(url, baseUrl).href;

      return new URL(fullUrl).href
        .replace(/\/$/, '')
        .replace(/^http:/, 'https:')
        .replace(/^https:\/\/(?!www\.)/, 'https://www.');
    } catch {
      return null;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private processContent(content: string | string[]): string {
    console.log('Processing content...');
    return Array.isArray(content)
      ? content.map((text) => this.contentFilter.filterText(text)).join('\n')
      : this.contentFilter.filterText(content);
  }

  private async processWithLLM(content: string, url: string): Promise<string> {
    try {
      if (!content?.trim()) {
        console.log(`Empty content for ${url}, skipping LLM processing`);
        return '';
      }

      await this.rateLimiter.acquire();

      const filteredContent = this.contentFilter.filterText(content);

      try {
        console.log('Processing content with LLM for URL:', url);
        const context = ContentAnalyzer.analyzeContent(url, filteredContent);
        const dynamicPrompt = PromptGenerator.generatePrompt(context, filteredContent);

        const model = await genAI.getGenerativeModel({
          model: gemini_model.model,
          safetySettings,
        });

        const response = await withRetry(() => model.generateContent(dynamicPrompt));

        const processedResponse = await this.validator.validateAIResponse(response.response.text());

        if (processedResponse.isValid) {
          return processedResponse.reason ?? filteredContent;
        }

        console.log(`Invalid AI response for ${url}, using filtered content`);
        return filteredContent;
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('429') || error.message.includes('quota'))
        ) {
          console.log(`Quota exceeded for ${url}, using filtered content`);
          return filteredContent;
        }
        throw error;
      }
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          (error.message.includes('429') || error.message.includes('quota'))
        )
      ) {
        console.error('Error processing content with LLM:', error);
      }
      return '';
    }
  }

  private async takeScreenshot(page: Page, url: string): Promise<string> {
    try {
      const urlObj = new URL(url);
      const sanitizedPath = this.generateRoutePath(urlObj);
      const timestamp = Date.now();

      const dirPath = path.join(this.outputDir, sanitizedPath);

      try {
        await fs.access(dirPath);
      } catch {
        await fs.mkdir(dirPath, { recursive: true });
      }

      const files = await fs.readdir(dirPath);
      const existingScreenshot = files.find((file) => file.startsWith('screenshot_'));

      if (existingScreenshot) {
        console.log(`Screenshot already exists for ${url}`);
        return path.join(dirPath, existingScreenshot);
      }

      const filename = `screenshot_${timestamp}.png`;
      const filepath = path.join(dirPath, filename);

      await page.screenshot({
        path: filepath,
        fullPage: true,
        timeout: WebScraper.TIMEOUTS.screenshot,
      });

      return filepath;
    } catch (error) {
      console.error(`Screenshot failed for ${url}:`, error);
      return '';
    }
  }

  private async scrollPage(page: Page): Promise<void> {
    console.log('Scrolling page...');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const distance = 100;
          const interval = setInterval(() => {
            window.scrollBy(0, distance);
            if (window.scrollY + window.innerHeight >= document.body.scrollHeight) {
              clearInterval(interval);
              window.scrollTo(0, 0);
              setTimeout(resolve, 500);
            }
          }, 100);
        }),
    );
  }

  private createErrorResult(url: string, error: Error | string): PageResult {
    const errorMessage = error instanceof Error ? error.message : error;

    if (!errorMessage.includes('429') && !errorMessage.includes('quota')) {
      console.error('Creating error result for URL:', url, errorMessage);
    }

    return {
      url,
      contentPath: '',
      processedContentPath: '',
      screenshot: '',
      error: errorMessage,
      timestamp: Date.now(),
    };
  }

  private async saveToFile(
    content: unknown,
    type: 'content' | 'processed',
    url: string,
  ): Promise<string> {
    try {
      if (!content) return '';

      const contentString =
        typeof content === 'string' ? content : JSON.stringify(content, null, 2);

      const urlObj = new URL(url);
      const sanitizedPath = this.generateRoutePath(urlObj);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dirPath = path.join(this.outputDir, sanitizedPath);

      try {
        await fs.access(dirPath);
      } catch {
        await fs.mkdir(dirPath, { recursive: true });
      }

      const files = await fs.readdir(dirPath);
      const existingFile = files.find((file) => file.startsWith(`${type}_`));

      if (existingFile) {
        console.log(`File of type ${type} already exists for ${url}`);
        return path.join(dirPath, existingFile);
      }

      const filename = `${type}_${timestamp}.txt`;
      const filepath = path.join(dirPath, filename);
      await fs.writeFile(filepath, contentString, 'utf8');

      return filepath;
    } catch (error) {
      console.error(`Failed to save ${type} file for ${url}:`, error);
      return '';
    }
  }

  private generateRoutePath(urlObj: URL): string {
    return (
      urlObj.pathname
        .replace(/\.(html?|php|aspx?|jsp)$/i, '')
        .replace(/^\/|\/$/g, '')
        .replace(/[^a-z0-9]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/-$/g, '')
        .toLowerCase() || 'root'
    );
  }

  private isNonTextualFile(pathname: string): boolean {
    return /\.(jpg|jpeg|png|gif|svg|pdf|doc|docx|xls|xlsx|zip|rar)$/i.test(pathname);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private async handleShutdown(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    console.log('Gracefully shutting down...');

    try {
      await this.cleanup();
      await this.saveScrapingReport();
    } catch (error) {
      console.error('Error during shutdown:', error);
    } finally {
      process.exit(0);
    }
  }

  private async saveScrapingReport(): Promise<void> {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        totalUrls: this.processedUrls.size,
        successfulUrls: Array.from(this.results.entries()).filter(([_, result]) => !result.error)
          .length,
        failedUrls: Array.from(this.results.entries())
          .filter(([_, result]) => result.error)
          .map(([url, result]) => ({
            url,
            error: result.error,
          })),
        riskLevels: {
          low: 0,
          medium: 0,
          high: 0,
          critical: 0,
        },
        urlPaths: {} as Record<string, string[]>,
      };

      for (const [url, result] of this.results.entries()) {
        const urlObj = new URL(url);
        const sanitizedPath = this.generateRoutePath(urlObj);

        if (!report.urlPaths[sanitizedPath]) {
          report.urlPaths[sanitizedPath] = [];
        }

        report.urlPaths[sanitizedPath].push(url);
      }

      await fs.writeFile(
        path.join(this.outputDir, 'scraping-report.json'),
        JSON.stringify(report, null, 2),
      );
    } catch (error) {
      console.error('Failed to save scraping report:', error);
    }
  }
}

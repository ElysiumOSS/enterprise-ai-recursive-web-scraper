import type { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import { PuppeteerExtraPluginAdblocker } from 'puppeteer-extra-plugin-adblocker';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { CodeBlock } from './types.js';

const browser = puppeteer
  .use(StealthPlugin())
  .use(new PuppeteerExtraPluginAdblocker({ blockTrackers: true }));

const BROWSER_OPTIONS: PuppeteerLaunchOptions = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-web-security',
  ],
  timeout: 30000,
};

const RESTRICTED_PATTERNS = {
  TLD: /\.(xxx|sex|adult|porn)$/i,
  SUBDOMAIN: /^(?:porn|xxx|adult|sex)[-.]/i,
  CONTENT: [
    /\b(?:p[o0]rn(?:ography)?|xxx)\b/i,
    /\b(?:18\+\s*(?:explicit|content|only))\b/i,
    /\b(?:escort\s*service|cam\s*(?:girl|model|show))\b/i,
  ],
};

export class ContentFilter {
  private static instance: ContentFilter;
  private restrictedDomains: Set<string>;

  private constructor() {
    this.restrictedDomains = new Set();
  }

  static getInstance(): ContentFilter {
    if (!this.instance) {
      this.instance = new ContentFilter();
    }
    return this.instance;
  }

  async initialize(): Promise<void> {
    try {
      const { nsfw } = await import('../data/index.js');
      this.restrictedDomains = new Set(Object.keys(nsfw).map(this.normalizeDomain));
    } catch (error) {
      console.error('Failed to initialize content filter:', error);
      throw error;
    }
  }

  private normalizeDomain(url: string): string {
    return url
      .toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/i, '')
      .split('/')[0];
  }

  isRestricted(url: string): boolean {
    const domain = this.normalizeDomain(url);
    return (
      this.restrictedDomains.has(domain) ||
      RESTRICTED_PATTERNS.TLD.test(domain) ||
      RESTRICTED_PATTERNS.SUBDOMAIN.test(domain)
    );
  }

  filterText(text: string): string {
    let filtered = text;
    RESTRICTED_PATTERNS.CONTENT.forEach((pattern) => {
      filtered = String(filtered).replace(pattern, ' ');
    });
    return filtered;
  }
}

class PageExtractor {
  static async extract(page: Page): Promise<{
    texts: string[];
    codeBlocks: CodeBlock[];
  }> {
    return page.evaluate(() => {
      const texts: string[] = [];
      const codeBlocks: CodeBlock[] = [];

      const isCode = (el: Element): boolean => {
        const tag = el.tagName.toLowerCase();
        const className = String(el.className).toLowerCase() || '';
        return (
          tag === 'pre' ||
          tag === 'code' ||
          className.includes('code') ||
          className.includes('language-') ||
          className.includes('highlight')
        );
      };

      const getLanguage = (el: Element): string => {
        const className = String(el.className).toLowerCase() || '';
        const langs = ['javascript', 'typescript', 'python', 'java', 'cpp', 'css', 'html'];
        return langs.find((lang) => className.includes(lang)) || 'plaintext';
      };

      document.querySelectorAll('*').forEach((el) => {
        if (isCode(el)) {
          const code = el.textContent?.trim();
          if (code) {
            codeBlocks.push({
              language: getLanguage(el),
              code,
              lineNumbers: el.className?.includes('line-numbers') || false,
            });
          }
        } else if (/^(P|DIV|SPAN|A|H[1-6]|LI)$/i.test(el.tagName)) {
          const text =
            el.textContent
              ?.trim()
              .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
              .replace(/[^\x00-\x7F]/g, '')
              .replace(/\s+/g, ' ')
              .replace(/[\n\r]+/g, ' ') || '';
          if (text && !isCode(el.parentElement!)) {
            texts.push(text);
          }
        }
      });

      return { texts, codeBlocks };
    });
  }
}

export async function scrape(url: string): Promise<{
  filteredTexts?: string[];
  error?: string;
}> {
  let browserInstance: Browser | null = null;
  let page: Page | null = null;

  try {
    if (!url?.trim()) {
      throw new Error('Invalid URL provided');
    }

    const filter = ContentFilter.getInstance();
    await filter.initialize();

    if (filter.isRestricted(url)) {
      return { error: 'Domain contains restricted content' };
    }

    browserInstance = await browser.launch(BROWSER_OPTIONS);
    page = await browserInstance.newPage();

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      ['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())
        ? req.abort()
        : req.continue();
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    if (filter.isRestricted(page.url())) {
      return { error: 'Domain contains restricted content' };
    }

    const { texts } = await PageExtractor.extract(page);
    const filteredTexts = texts
      .filter((text, index, self) => self.indexOf(text) === index)
      .map((text) => filter.filterText(text));

    return { filteredTexts };
  } catch (error) {
    console.error('Scraping error:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  } finally {
    await page?.close().catch(() => {});
    await browserInstance?.close().catch(() => {});
  }
}

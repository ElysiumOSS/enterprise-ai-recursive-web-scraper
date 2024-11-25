<h1 align="center">Enterprise AI Recursive Web Scraper</h1>

<p align="center">Advanced AI-powered recursive web scraper utilizing Groq LLMs, Puppeteer, and Playwright for intelligent content extraction</p>

<p align="center">
	<!-- prettier-ignore-start -->
	<!-- ALL-CONTRIBUTORS-BADGE:START -->
	<a href="#contributors" target="_blank"><img alt="👪 All Contributors: 1" src="https://img.shields.io/badge/%F0%9F%91%AA_all_contributors-1-21bb42.svg" /></a>
	<!-- ALL-CONTRIBUTORS-BADGE:END -->
	<!-- prettier-ignore-end -->
	<a href="https://github.com/WomB0ComB0/enterprise-ai-recursive-web-scraper/blob/main/.github/CODE_OF_CONDUCT.md" target="_blank"><img alt="🤝 Code of Conduct: Kept" src="https://img.shields.io/badge/%F0%9F%A4%9D_code_of_conduct-kept-21bb42" /></a>
	<a href="https://codecov.io/gh/WomB0ComB0/enterprise-ai-recursive-web-scraper" target="_blank"><img alt="🧪 Coverage" src="https://img.shields.io/codecov/c/github/WomB0ComB0/enterprise-ai-recursive-web-scraper?label=%F0%9F%A7%AA%20coverage" /></a>
	<a href="https://github.com/WomB0ComB0/enterprise-ai-recursive-web-scraper/blob/main/LICENSE.md" target="_blank"><img alt="📝 License: MIT" src="https://img.shields.io/badge/%F0%9F%93%9D_license-MIT-21bb42.svg"></a>
	<a href="http://npmjs.com/package/enterprise-ai-recursive-web-scraper"><img alt="📦 npm version" src="https://img.shields.io/npm/v/enterprise-ai-recursive-web-scraper?color=21bb42&label=%F0%9F%93%A6%20npm" /></a>
	<img alt="💪 TypeScript: Strict" src="https://img.shields.io/badge/%F0%9F%92%AA_typescript-strict-21bb42.svg" />
</p>

## ✨ Features

* 🚀 **High Performance**: 
  - Blazing fast multi-threaded scraping with concurrent processing
  - Smart rate limiting to prevent API throttling and server overload
  - Automatic request queuing and retry mechanisms
* 🤖 **AI-Powered**: Intelligent content extraction using Groq LLMs
* 🌐 **Multi-Browser**: Support for Chromium, Firefox, and WebKit
* 📊 **Smart Extraction**: 
  - Structured data extraction without LLMs using CSS selectors
  - Topic-based and semantic chunking strategies
  - Cosine similarity clustering for content deduplication
* 🎯 **Advanced Capabilities**:
  - Recursive domain crawling with boundary respect
  - Intelligent rate limiting with token bucket algorithm
  - Session management for complex multi-page flows
  - Custom JavaScript execution support
  - Enhanced screenshot capture with lazy-load detection
  - iframe content extraction
* 🔒 **Enterprise Ready**:
  - Proxy support with authentication
  - Custom headers and user-agent configuration
  - Comprehensive error handling and retry mechanisms
  - Flexible timeout and rate limit management
  - Detailed logging and monitoring

## 🚀 Quick Start

To install the package, run:

```bash
npm install enterprise-ai-recursive-web-scraper
```

### Using the CLI

The `enterprise-ai-recursive-web-scraper` package includes a command-line interface (CLI) that you can use to perform web scraping tasks directly from the terminal.

#### Installation

Ensure that the package is installed globally to use the CLI:

```bash
npm install -g enterprise-ai-recursive-web-scraper
```

#### Running the CLI

Once installed, you can use the `web-scraper` command to start scraping. Here’s a basic example of how to use it:

```bash
web-scraper --api-key YOUR_API_KEY --url https://example.com --output ./output
```

#### CLI Options

- `-k, --api-key <key>`: **(Required)** Your Google Gemini API key
- `-u, --url <url>`: **(Required)** The URL of the website to scrape
- `-o, --output <directory>`: Output directory for scraped data (default: `scraping_output`)
- `-d, --depth <number>`: Maximum crawl depth (default: `3`)
- `-c, --concurrency <number>`: Concurrent scraping limit (default: `5`)
- `-r, --rate-limit <number>`: Requests per second (default: `5`)
- `-t, --timeout <number>`: Request timeout in milliseconds (default: `30000`)
- `-f, --format <type>`: Output format: json|csv|markdown (default: `json`)
- `-v, --verbose`: Enable verbose logging
- `--retry-attempts <number>`: Number of retry attempts (default: `3`)
- `--retry-delay <number>`: Delay between retries in ms (default: `1000`)

Example usage with rate limiting:

```bash
web-scraper --api-key YOUR_API_KEY --url https://example.com --output ./output \
  --depth 5 --concurrency 10 --rate-limit 2 --retry-attempts 3 --format csv --verbose
```

## 🔧 Advanced Usage

### Rate Limiting Configuration

Configure rate limiting to respect server limits and prevent throttling:

```typescript
import { WebScraper, RateLimiter } from "enterprise-ai-recursive-web-scraper";

const scraper = new WebScraper({
    rateLimiter: new RateLimiter({
        maxTokens: 5,      // Maximum number of tokens
        refillRate: 1,     // Tokens refilled per second
        retryAttempts: 3,  // Number of retry attempts
        retryDelay: 1000   // Delay between retries (ms)
    })
});
```

### Structured Data Extraction

To extract structured data using a JSON schema, you can use the `JsonExtractionStrategy`:

```typescript
import { WebScraper, JsonExtractionStrategy } from "enterprise-ai-recursive-web-scraper";

const schema = {
    baseSelector: "article",
    fields: [
        { name: "title", selector: "h1" },
        { name: "content", selector: ".content" },
        { name: "date", selector: "time", attribute: "datetime" }
    ]
};

const scraper = new WebScraper({
    extractionStrategy: new JsonExtractionStrategy(schema)
});
```

### Custom Browser Session

You can customize the browser session with specific configurations:

```typescript
import { WebScraper } from "enterprise-ai-recursive-web-scraper";

const scraper = new WebScraper({
    browserConfig: {
        headless: false,
        proxy: "http://proxy.example.com",
        userAgent: "Custom User Agent"
    }
});
```

## 🤝 Contributors

<!-- ALL-CONTRIBUTORS-LIST:START -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%">
        <a href="https://www.mikeodnis.dev/">
          <img src="https://avatars.githubusercontent.com/u/95197809?v=4?s=100" width="100px;" alt="Mike Odnis"/>
          <br /><sub><b>Mike Odnis</b></sub>
        </a>
        <br />
        <a href="https://github.com/WomB0ComB0/enterprise-ai-recursive-web-scraper/commits?author=WomB0ComB0" title="Code">💻</a> 
        <a href="#content-WomB0ComB0" title="Content">🖋</a>
        <a href="#ideas-WomB0ComB0" title="Ideas">🤔</a>
        <a href="#infra-WomB0ComB0" title="Infrastructure">🚇</a>
      </td>
    </tr>
  </tbody>
</table>
<!-- ALL-CONTRIBUTORS-LIST:END -->

## 📄 License

MIT © [Mike Odnis](https://github.com/WomB0ComB0)

> 💙 Built with [`create-typescript-app`](https://github.com/JoshuaKGoldberg/create-typescript-app)
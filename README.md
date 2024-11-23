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

* 🚀 **High Performance**: Blazing fast multi-threaded scraping with concurrent processing
* 🤖 **AI-Powered**: Intelligent content extraction using Groq LLMs
* 🌐 **Multi-Browser**: Support for Chromium, Firefox, and WebKit
* 📊 **Smart Extraction**: 
  - Structured data extraction without LLMs using CSS selectors
  - Topic-based and semantic chunking strategies
  - Cosine similarity clustering for content deduplication
* 🎯 **Advanced Capabilities**:
  - Recursive domain crawling with boundary respect
  - Session management for complex multi-page flows
  - Custom JavaScript execution support
  - Enhanced screenshot capture with lazy-load detection
  - iframe content extraction
* 🔒 **Enterprise Ready**:
  - Proxy support with authentication
  - Custom headers and user-agent configuration
  - Comprehensive error handling
  - Flexible timeout management

## 🚀 Quick Start

```bash
npm i enterprise-ai-recursive-web-scraper
```

```typescript
import { WebScraper } from "enterprise-ai-recursive-web-scraper";

async function main() {
    const scraper = new WebScraper({
        outputDir: "scraping_output",
        verbose: true
    });

    const results = await scraper.scrapeWebsite("https://example.com");
    console.log(results);
}

main().catch(console.error);
```

## 🔧 Advanced Usage

### Structured Data Extraction

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

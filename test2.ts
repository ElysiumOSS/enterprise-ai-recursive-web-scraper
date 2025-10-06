import { WebScraper } from "enterprise-ai-recursive-web-scraper";
(async () => {
  const scraper = new WebScraper({
    maxConcurrentPages: 100,
    maxDepth: 100,
  });
  
  const results = await scraper.scrapeWebsite("https://gdsc-fsc-l.web.app/");
  
  console.log(results);
})();
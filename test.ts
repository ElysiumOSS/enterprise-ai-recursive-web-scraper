import { EnhancedWebScraper } from "./src/classes/web.js";

const scraper = new EnhancedWebScraper();
const results = await scraper.scrapeWebsite("https://www.sepamujer.org");

console.log(results);

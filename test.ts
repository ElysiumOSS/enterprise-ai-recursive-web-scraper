import { WebScraper } from "./src/classes/web.js";

const scraper = new WebScraper();
console.log("Created scraper instance");

try {
	console.log("Starting website scrape...");
	const results = await scraper.scrapeWebsite("https://mikeodnis.dev");
	console.log("Scrape completed:", results);
} catch (error) {
	console.error("Scrape failed:", {
		error: error.message,
		stack: error.stack,
		cause: error.cause,
	});
}

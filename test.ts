import { WebScraper } from "./src/classes/web.js";

const scraper = new WebScraper();
console.log("Created scraper instance");

try {
	console.log("Starting website scrape...");
	const results = await scraper.scrapeWebsite("https://blog.mikeodnis.dev/beyond-static-creating-a-dynamic-developer-portfolio-with-nextjs-and-modern-web-tech");
	console.log("Scrape completed:", results);
} catch (error) {
	console.error("Scrape failed:", {
		error: error.message,
		stack: error.stack,
		cause: error.cause,
	});
}

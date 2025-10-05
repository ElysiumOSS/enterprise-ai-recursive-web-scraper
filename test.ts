import { WebScraper } from './src/classes/web.js';

async function test() {
  try {
    console.log('Creating scraper instance...');
    const scraper = new WebScraper({
      maxConcurrentPages: 100,
      maxDepth: 100,
    });

    console.log('Starting website scrape...');
    const results = await scraper.scrapeWebsite('https://gdsc-fsc-l.web.app/');

    console.log('Scrape completed with results:');
    console.log('Number of pages scraped:', results.size);

    for (const [url, result] of results.entries()) {
      console.log('\nPage Result:');
      console.log('URL:', url);
      console.log('Content Path:', result.contentPath);
      console.log('Processed Content Path:', result.processedContentPath);
      console.log('Screenshot Path:', result.screenshot);
      if (result.error) {
        console.log('Error:', result.error);
      }
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

test().catch(console.error);

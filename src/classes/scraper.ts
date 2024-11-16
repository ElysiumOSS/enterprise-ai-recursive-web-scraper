import puppeteer from "puppeteer-extra";
import type { PuppeteerLaunchOptions, Browser, Page } from "puppeteer";
import { PuppeteerExtra } from "puppeteer-extra";
import { PuppeteerExtraPluginAdblocker } from "puppeteer-extra-plugin-adblocker";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { nsfw, nsfwNames, slurs } from "../data/index.js";
import { Row, TrieNode } from "./types.js";

const puppeteerExtra = puppeteer as unknown as PuppeteerExtra;

puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(
	new PuppeteerExtraPluginAdblocker({
		blockTrackers: true,
		useCache: true,
		blockTrackersAndAnnoyances: true,
	}),
);

const createTrieNode = (): TrieNode => ({
	children: {},
	isEndOfWord: false,
});

const insertIntoTrie = (root: TrieNode, word: string): void => {
	let node = root;
	for (const char of word) {
		node = node.children[char] = node.children[char] || createTrieNode();
	}
	node.isEndOfWord = true;
};

const searchInTrie = (root: TrieNode, word: string): boolean => {
	let node = root;
	for (const char of word) {
		if (!node.children[char]) {
			return false;
		}
		node = node.children[char];
	}
	return node.isEndOfWord;
};

const createHashSet = <T>(arr: T[]): Set<T> => new Set(arr);

const removeDuplicates = (text: string): string => {
	const segments: string[] = text.match(/[^.!?]+[.!?]+/g) || [text];
	const uniqueSegments = Array.from(new Set(segments));
	return uniqueSegments.join(" ");
};

const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

let cachedData: Row[] | null = null;
let cachedNewWords: Row[] | null = null;
let filterTrie: TrieNode | null = null;
let filterDict: Set<string> | null = null;
let newWordsTree: TrieNode | null = null;
let cachedNSFW: string[] | null = null;

const initializeFilterWords = (): void => {
	if (!cachedData) {
		cachedData = Object.keys(slurs).map((key) => ({ text: key }));
		filterTrie = createTrieNode();
		filterDict = createHashSet(Object.keys(slurs));
		cachedData.forEach((row) => insertIntoTrie(filterTrie!, row.text));
	}
	if (!cachedNewWords) {
		cachedNewWords = Object.keys(nsfwNames).map((key) => ({ text: key }));
		newWordsTree = createTrieNode();
		cachedNewWords.forEach((row) => insertIntoTrie(newWordsTree!, row.text));
	}
};

const fetchRobotsTxt = async (url: string): Promise<string> => {
	try {
		const baseUrl = new URL(url).origin;
		const robotsUrl = `${baseUrl}/robots.txt`;
		const browser = await puppeteerExtra.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
			timeout: 120000,
		} as PuppeteerLaunchOptions);
		const page = await browser.newPage();

		await page.goto(robotsUrl, {
			timeout: 120000,
			waitUntil: "domcontentloaded",
		});
		const robotsTxtContent = await page.evaluate(() => document.body.innerText);

		await browser.close();
		return robotsTxtContent;
	} catch (error) {
		if (
			error instanceof Error &&
			(error.message.includes("net::ERR_NAME_NOT_RESOLVED") ||
				error.message.includes("404"))
		) {
			return "";
		}
		throw new Error(
			`Failed to fetch robots.txt for ${url}: ${
				error instanceof Error ? error.message : "Unknown error"
			}`,
		);
	}
};

const parseRobotsTxt = (
	robotsTxtContent: string,
	userAgent: string,
	url: string,
): { isAllowed: boolean; isDisallowed: boolean } => {
	const lines = robotsTxtContent.split("\n");
	let currentUserAgent: string | null = null;
	let isAllowed = false;
	let isDisallowed = false;

	for (const line of lines) {
		const trimmedLine = line.trim().toLowerCase();
		if (trimmedLine.startsWith("user-agent:")) {
			currentUserAgent = trimmedLine.split(":")[1].trim();
		} else if (
			currentUserAgent === userAgent.toLowerCase() ||
			currentUserAgent === "*"
		) {
			if (trimmedLine.startsWith("disallow:")) {
				const path = trimmedLine.split(":")[1].trim();
				if (url.includes(path) || path === "") {
					isDisallowed = true;
				}
			} else if (trimmedLine.startsWith("allow:")) {
				const path = trimmedLine.split(":")[1].trim();
				if (url.includes(path)) {
					isAllowed = true;
				}
			}
		}
	}

	if (isDisallowed && isAllowed) {
		isDisallowed = false;
	}

	return { isAllowed, isDisallowed };
};

const filterText = (text: string, replace: string): string => {
	if (!text) {
		return text;
	}
	const words = text.split(" ");
	const filteredWords = words.map((word) =>
		filterDict!.has(word) || searchInTrie(filterTrie!, word) ? replace : word,
	);
	return filteredWords.join(" ");
};

const scrape = async (
	url: Readonly<string>,
): Promise<
	| {
			flaggedDomain: boolean;
			containsCensored: boolean;
			filteredTexts: string[];
	  }
	| { [key: string]: string }
> => {
	try {
		let isAllowed = true;
		let isDisallowed = false;
		const robotsTxtContent = await fetchRobotsTxt(url);
		if (robotsTxtContent === "") {
			return { error: "Robots.txt not found, cannot scrape" };
		}
		const userAgents = robotsTxtContent
			.split("\n")
			.filter(
				(line) =>
					line.toLowerCase().startsWith("user-agent:") ||
					line.toLowerCase().startsWith("user-agent"),
			)
			.map((line) => line.split(":")[1].trim());

		if (userAgents.length > 0) {
			const results = userAgents.map((userAgent) =>
				parseRobotsTxt(robotsTxtContent, userAgent, url),
			);
			isAllowed = results.some((result) => result.isAllowed);
			isDisallowed = results.some((result) => result.isDisallowed);
		}

		if (isDisallowed) {
			return { error: `Scraping disallowed by robots.txt for ${url}` };
		}
		if (!isAllowed) {
			return {
				error: `Scraping not explicitly allowed by robots.txt for ${url}`,
			};
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes("net::ERR_CERT_")) {
			console.error("SSL/TLS Error:", error.message);
			throw new Error(`SSL/TLS Error: ${error.message}`);
		} else {
			throw new Error(
				`Error during robots.txt parsing: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
		}
	}

	if (!cachedNSFW) {
		cachedNSFW = Object.keys(nsfw);
	}

	const nsfw_domain = cachedNSFW.some((domain) => url.includes(domain));
	if (nsfw_domain) {
		return { error: "Domain contains NSFW content" };
	}

	await initializeFilterWords();
	let browser: Browser;
	try {
		browser = await puppeteerExtra.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
			timeout: 0,
		} as PuppeteerLaunchOptions);
	} catch (error) {
		throw new Error(
			`Error launching browser: ${
				error instanceof Error ? error.message : "Unknown error"
			}`,
		);
	}

	let page: Page;
	try {
		page = await browser.newPage();
		const response = await page.goto(url, {
			timeout: 0,
			waitUntil: "domcontentloaded",
		});
		await wait(5);

		const finalUrl = response?.url() || url;
		if (cachedNSFW.some((domain) => finalUrl.includes(domain))) {
			await browser.close();
			return { error: "NSFW domain" };
		}

		const texts = await page.evaluate(() => {
			const elements = Array.from(
				document.querySelectorAll(
					"p, div, span, a, h1, h2, h3, h4, h5, h6, li",
				),
			);
			return elements
				.map(
					(el) =>
						el.textContent
							?.trim()
							.replace(/[\u{1F600}-\u{1F64F}]/gu, "")
							.replace(/[^\x00-\x7F]/g, "")
							.replace(/\s+/g, " ")
							.replace(/[\n\r]+/g, " ") || "",
				)
				.filter((text) => text.length > 0);
		});

		await browser.close();

		const processedTexts = texts.map(removeDuplicates);
		const uniqueTexts = createHashSet(processedTexts);
		const filteredTexts = await Promise.all(
			Array.from(uniqueTexts).map((text: string) => filterText(text, "***")),
		);
		const containsCensored = filteredTexts.some((text: string) =>
			text.includes("***"),
		);

		return {
			flaggedDomain: false,
			containsCensored,
			filteredTexts,
		};
	} catch (error) {
		console.error(`Scraping failed: ${error}`);
		throw new Error(
			`Scraping failed: ${
				error instanceof Error ? error.message : "Unknown error"
			}`,
		);
	} finally {
		if (browser) {
			await browser.close();
		}
	}
};

export { scrape, initializeFilterWords, filterText };

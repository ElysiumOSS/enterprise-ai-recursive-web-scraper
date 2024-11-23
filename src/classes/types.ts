export interface TrieNode {
	children: { [key: string]: TrieNode };
	isEndOfWord: boolean;
}

export interface ContentContext {
  pageType: 'article' | 'product' | 'category' | 'profile' | 'general';
  contentLength: 'brief' | 'standard' | 'detailed';
  structureType: 'narrative' | 'analytical' | 'technical' | 'descriptive';
  targetAudience: 'general' | 'technical' | 'business' | 'academic';
}

export interface RouteAnalysis {
	patterns: RegExp[];
	signals: string[];
	context: ContentContext;
}

export interface CodeBlock {
	language: string;
	code: string;
	lineNumbers?: boolean;
}

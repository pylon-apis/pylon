/**
 * Pylon API Gateway tools for Vercel AI SDK
 * 
 * Provides 20+ AI capabilities including screenshot, web scraping, search,
 * PDF processing, OCR, translation, and more via a simple API gateway.
 * 
 * Payment is handled via x402 protocol (USDC on Base) with no API keys required.
 */

import { z } from 'zod';

const PYLON_GATEWAY_URL = 'https://pylon-gateway-api.fly.dev';

/**
 * Execute a capability via Pylon API Gateway
 */
async function executePylonCapability(capability: string, params: Record<string, any>): Promise<any> {
  try {
    const response = await fetch(`${PYLON_GATEWAY_URL}/do`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        capability,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Pylon API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generic Pylon tool for accessing any capability
 */
export const pylonTool = {
  description: `Access 20+ AI capabilities via Pylon API Gateway including:
    - screenshot: Capture web pages  
    - search: Web search
    - web-scrape: Extract web content
    - pdf-extract: Extract text from PDFs
    - ocr: Optical character recognition
    - translate: Language translation
    - and many more
    Uses x402 payment protocol - no API keys needed.`,
  parameters: z.object({
    capability: z.string().describe('The capability to execute (e.g., screenshot, search, pdf-extract)'),
    params: z.record(z.any()).describe('Parameters for the capability'),
  }),
  execute: async ({ capability, params }: { capability: string; params: Record<string, any> }) => {
    return await executePylonCapability(capability, params);
  },
};

/**
 * Specialized tool for taking screenshots
 */
export const pylonScreenshotTool = {
  description: 'Capture screenshots of web pages using Pylon AI gateway',
  parameters: z.object({
    url: z.string().url().describe('The URL to screenshot'),
    options: z.object({
      fullPage: z.boolean().optional().describe('Capture full page screenshot'),
      width: z.number().optional().describe('Viewport width'),
      height: z.number().optional().describe('Viewport height'),
    }).optional(),
  }),
  execute: async ({ url, options = {} }: { url: string; options?: any }) => {
    return await executePylonCapability('screenshot', { url, ...options });
  },
};

/**
 * Specialized tool for web search
 */
export const pylonSearchTool = {
  description: 'Search the web using Pylon AI gateway',
  parameters: z.object({
    query: z.string().describe('The search query'),
    count: z.number().optional().describe('Number of results to return'),
    region: z.string().optional().describe('Search region (e.g., "us", "uk")'),
  }),
  execute: async ({ query, count, region }: { query: string; count?: number; region?: string }) => {
    const params: any = { query };
    if (count) params.count = count;
    if (region) params.region = region;
    
    return await executePylonCapability('search', params);
  },
};

/**
 * Specialized tool for web scraping
 */
export const pylonScrapeTool = {
  description: 'Scrape and extract content from web pages using Pylon AI gateway',
  parameters: z.object({
    url: z.string().url().describe('The URL to scrape'),
    selector: z.string().optional().describe('CSS selector to target specific content'),
    format: z.enum(['text', 'markdown', 'html']).optional().describe('Output format'),
  }),
  execute: async ({ url, selector, format }: { url: string; selector?: string; format?: string }) => {
    const params: any = { url };
    if (selector) params.selector = selector;
    if (format) params.format = format;
    
    return await executePylonCapability('web-scrape', params);
  },
};

/**
 * Specialized tool for PDF text extraction
 */
export const pylonPdfExtractTool = {
  description: 'Extract text content from PDF files using Pylon AI gateway',
  parameters: z.object({
    url: z.string().url().optional().describe('URL of the PDF file'),
    file: z.string().optional().describe('Base64 encoded PDF file'),
    pages: z.array(z.number()).optional().describe('Specific pages to extract (1-indexed)'),
  }),
  execute: async ({ url, file, pages }: { url?: string; file?: string; pages?: number[] }) => {
    const params: any = {};
    if (url) params.url = url;
    if (file) params.file = file;
    if (pages) params.pages = pages;
    
    return await executePylonCapability('pdf-extract', params);
  },
};

/**
 * Specialized tool for OCR (Optical Character Recognition)
 */
export const pylonOcrTool = {
  description: 'Extract text from images using OCR via Pylon AI gateway',
  parameters: z.object({
    url: z.string().url().optional().describe('URL of the image file'),
    image: z.string().optional().describe('Base64 encoded image file'),
    language: z.string().optional().describe('Language code for OCR (e.g., "en", "es")'),
  }),
  execute: async ({ url, image, language }: { url?: string; image?: string; language?: string }) => {
    const params: any = {};
    if (url) params.url = url;
    if (image) params.image = image;
    if (language) params.language = language;
    
    return await executePylonCapability('ocr', params);
  },
};

/**
 * Specialized tool for language translation
 */
export const pylonTranslateTool = {
  description: 'Translate text between languages using Pylon AI gateway',
  parameters: z.object({
    text: z.string().describe('Text to translate'),
    from: z.string().optional().describe('Source language code (auto-detected if not specified)'),
    to: z.string().describe('Target language code (e.g., "en", "es", "fr")'),
  }),
  execute: async ({ text, from, to }: { text: string; from?: string; to: string }) => {
    const params: any = { text, to };
    if (from) params.from = from;
    
    return await executePylonCapability('translate', params);
  },
};

/**
 * Collection of all Pylon tools for easy import
 */
export const pylonTools = {
  pylon: pylonTool,
  pylonScreenshot: pylonScreenshotTool,
  pylonSearch: pylonSearchTool,
  pylonScrape: pylonScrapeTool,
  pylonPdfExtract: pylonPdfExtractTool,
  pylonOcr: pylonOcrTool,
  pylonTranslate: pylonTranslateTool,
} as const;
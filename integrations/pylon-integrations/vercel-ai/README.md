# Vercel AI SDK Pylon Integration

This package provides Vercel AI SDK tools for interacting with the [Pylon API Gateway](https://pylonapi.com), giving your AI agents access to 20+ capabilities including screenshot capture, web scraping, search, PDF processing, OCR, translation, and more.

## Features

- 🚀 **No API Keys Required** - Uses x402 payment protocol (USDC on Base)
- 🛠️ **20+ AI Capabilities** - Screenshot, search, scrape, PDF extract, OCR, translate, etc.
- 🔧 **TypeScript Native** - Full TypeScript support with Zod validation
- ⚡ **Fast & Reliable** - Production-ready API gateway
- 🎯 **Agent Ready** - Built for ToolLoopAgent and modern AI workflows
- 💰 **Pay-per-Use** - Only pay for what you use via micropayments

## Installation

```bash
npm install @pylon-api/vercel-ai-tools
```

Or install from source:
```bash
npm install ai zod
```

## Quick Start

```typescript
import { ToolLoopAgent } from 'ai';
import { openai } from '@ai-sdk/openai';
import { pylonTools } from '@pylon-api/vercel-ai-tools';

// Create an agent with Pylon capabilities
const researchAgent = new ToolLoopAgent({
  model: openai('gpt-4'),
  system: 'You are a research assistant with web capabilities via Pylon.',
  tools: {
    search: pylonTools.pylonSearch,
    screenshot: pylonTools.pylonScreenshot,
    scrape: pylonTools.pylonScrape,
  },
});

// Use the agent
const result = await researchAgent.execute({
  messages: [{
    role: 'user', 
    content: 'Search for the latest AI news and take a screenshot of the top result'
  }],
});

console.log(result);
```

## Available Tools

### Generic Pylon Tool
Access any Pylon capability:

```typescript
import { pylonTools } from '@pylon-api/vercel-ai-tools';

// Use the generic tool for any capability
const result = await pylonTools.pylon.execute({
  capability: 'screenshot',
  params: { url: 'https://example.com' }
});
```

### Specialized Tools
Pre-configured tools for common use cases:

```typescript
import { 
  pylonScreenshotTool,
  pylonSearchTool,
  pylonScrapeTool,
  pylonPdfExtractTool,
  pylonOcrTool,
  pylonTranslateTool 
} from '@pylon-api/vercel-ai-tools';

// Screenshot tool
const screenshot = await pylonScreenshotTool.execute({
  url: 'https://example.com',
  options: { fullPage: true }
});

// Search tool
const searchResults = await pylonSearchTool.execute({
  query: 'AI developments 2025',
  count: 5
});

// Translation tool
const translation = await pylonTranslateTool.execute({
  text: 'Hello world',
  to: 'es'
});
```

## Agent Examples

### Research Agent
```typescript
import { ToolLoopAgent } from 'ai';
import { openai } from '@ai-sdk/openai';
import { pylonTools } from '@pylon-api/vercel-ai-tools';

export const researchAgent = new ToolLoopAgent({
  model: openai('gpt-4'),
  system: `You are an advanced research agent with multiple capabilities:
           - Search the web for information
           - Take screenshots of websites
           - Scrape web pages for detailed content
           - Extract text from PDFs
           - Perform OCR on images`,
  tools: {
    search: pylonTools.pylonSearch,
    screenshot: pylonTools.pylonScreenshot,
    scrape: pylonTools.pylonScrape,
    pdfExtract: pylonTools.pylonPdfExtract,
    ocr: pylonTools.pylonOcr,
  },
});
```

### Content Processing Agent
```typescript
export const contentAgent = new ToolLoopAgent({
  model: openai('gpt-4'),
  system: `You help process and translate various types of content.`,
  tools: {
    translate: pylonTools.pylonTranslate,
    ocr: pylonTools.pylonOcr,
    pdfExtract: pylonTools.pylonPdfExtract,
    scrape: pylonTools.pylonScrape,
  },
});
```

## Next.js Integration

### API Route Example
```typescript
// app/api/chat/route.ts
import { createAgentUIStreamResponse } from 'ai';
import { researchAgent } from '@/lib/agents';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentUIStreamResponse({
    agent: researchAgent,
    messages,
  });
}
```

### React Component Example
```typescript
'use client';

import { useChat } from '@ai-sdk/react';

export default function PylonChatExample() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="space-y-4 mb-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-3 rounded-lg ${
              message.role === 'user' 
                ? 'bg-blue-100 ml-auto max-w-xs' 
                : 'bg-gray-100 max-w-none'
            }`}
          >
            <div className="font-semibold text-sm mb-1">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div>{message.content}</div>
          </div>
        ))}
      </div>
      
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask me to search, screenshot, or translate..."
          className="flex-1 p-2 border rounded"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {isLoading ? 'Working...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
```

## Supported Capabilities

### Core Capabilities
- **screenshot** - Capture web page screenshots
- **search** - Web search with multiple engines
- **web-scrape** - Extract content from web pages
- **pdf-extract** - Extract text from PDF files
- **ocr** - Optical character recognition from images
- **translate** - Language translation

### Extended Capabilities
- **audio-transcribe** - Convert audio to text
- **image-generate** - Generate images from text
- **email-send** - Send emails
- **calendar-event** - Create calendar events
- **qr-generate** - Generate QR codes
- **barcode-scan** - Scan barcodes
- **weather-get** - Get weather information
- **news-fetch** - Fetch news articles
- **stock-price** - Get stock prices
- **crypto-price** - Get cryptocurrency prices
- And many more...

## Tool Configuration

### Basic Usage
```typescript
const result = await pylonSearchTool.execute({
  query: 'TypeScript best practices',
  count: 10,
  region: 'us'
});
```

### Advanced Configuration
```typescript
const screenshot = await pylonScreenshotTool.execute({
  url: 'https://example.com',
  options: {
    fullPage: true,
    width: 1920,
    height: 1080
  }
});
```

### Error Handling
```typescript
try {
  const result = await pylonScreenshotTool.execute({
    url: 'https://invalid-url.com'
  });
  console.log(result);
} catch (error) {
  console.error('Tool execution failed:', error);
}
```

## Payment

Pylon uses the x402 payment protocol with USDC on Base network. No upfront API keys or subscriptions required - you only pay for successful requests via micropayments.

## TypeScript Support

All tools include full TypeScript support with Zod schemas for parameter validation:

```typescript
import { z } from 'zod';

// Parameters are fully typed and validated
const searchParams = {
  query: 'AI news',     // string (required)
  count: 5,            // number (optional)  
  region: 'us'         // string (optional)
};
```

## Contributing

This integration is part of the open-source Pylon project. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

## License

MIT License - see LICENSE file for details.

## Support

- 📖 **Documentation**: [docs.pylonapi.com](https://docs.pylonapi.com)
- 🐛 **Issues**: [GitHub Issues](https://github.com/pylon-apis/pylon/issues)
- 💬 **Community**: [Discord](https://discord.gg/pylon-api)
- 🌐 **Website**: [pylonapi.com](https://pylonapi.com)
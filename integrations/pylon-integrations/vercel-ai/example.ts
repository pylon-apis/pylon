/**
 * Example usage of Pylon tools with Vercel AI SDK
 */

import { ToolLoopAgent } from 'ai';
import { openai } from '@ai-sdk/openai';
import { pylonTools } from './pylon-tools';

/**
 * Example 1: Simple agent with Pylon search capability
 */
export const searchAgent = new ToolLoopAgent({
  model: openai('gpt-4'),
  system: `You are a research assistant with access to web search via Pylon.
           Use the search tool to find current information and provide comprehensive answers.`,
  tools: {
    search: pylonTools.pylonSearch,
  },
});

/**
 * Example 2: Multi-capability research agent
 */
export const researchAgent = new ToolLoopAgent({
  model: openai('gpt-4'),
  system: `You are an advanced research agent with multiple capabilities:
           - Search the web for information
           - Take screenshots of websites
           - Scrape web pages for detailed content
           - Extract text from PDFs
           - Perform OCR on images
           
           Use these tools strategically to provide thorough research and analysis.`,
  tools: {
    search: pylonTools.pylonSearch,
    screenshot: pylonTools.pylonScreenshot,
    scrape: pylonTools.pylonScrape,
    pdfExtract: pylonTools.pylonPdfExtract,
    ocr: pylonTools.pylonOcr,
    genericPylon: pylonTools.pylon, // For any other Pylon capabilities
  },
});

/**
 * Example 3: Translation and content processing agent
 */
export const contentAgent = new ToolLoopAgent({
  model: openai('gpt-4'),
  system: `You are a content processing agent that can:
           - Translate text between languages
           - Extract text from images using OCR
           - Process PDF documents
           - Scrape web content
           
           Help users process and translate various types of content.`,
  tools: {
    translate: pylonTools.pylonTranslate,
    ocr: pylonTools.pylonOcr,
    pdfExtract: pylonTools.pylonPdfExtract,
    scrape: pylonTools.pylonScrape,
  },
});

/**
 * Example usage in a Next.js API route
 */
export async function handleChatRequest(messages: any[]) {
  // Use the research agent for comprehensive tasks
  const result = await researchAgent.execute({
    messages,
  });
  
  return result;
}

/**
 * Example usage with specific tools
 */
export async function exampleUsage() {
  // Example 1: Direct tool usage
  const searchResult = await pylonTools.pylonSearch.execute({
    query: 'latest AI developments 2025',
    count: 5,
  });
  
  console.log('Search results:', searchResult);
  
  // Example 2: Screenshot a website
  const screenshotResult = await pylonTools.pylonScreenshot.execute({
    url: 'https://www.openai.com',
    options: {
      fullPage: true,
      width: 1920,
      height: 1080,
    },
  });
  
  console.log('Screenshot captured:', screenshotResult);
  
  // Example 3: Translate text
  const translationResult = await pylonTools.pylonTranslate.execute({
    text: 'Hello, how are you?',
    to: 'es',
  });
  
  console.log('Translation:', translationResult);
}

/**
 * React component example for using with UI
 */
/*
'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function PylonChatExample() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat-with-pylon', // Your API endpoint using the agents above
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
*/
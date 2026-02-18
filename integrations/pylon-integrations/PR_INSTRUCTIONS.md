# Pylon Framework Integration PR Instructions

This document provides step-by-step instructions for creating PRs to integrate Pylon API Gateway with major AI frameworks.

## Prerequisites

1. **GitHub Account**: Use the `pylon-apis` GitHub account
2. **Git Configuration**: 
   ```bash
   git config user.name "pylon-apis"
   git config user.email "sean@trycase.ai"
   ```
3. **Authentication**: Ensure GitHub CLI is authenticated with the pylon-apis account

## 1. LangChain Integration

### Repository Structure
LangChain has moved to a partner-based architecture. Tools are now in `libs/partners/` directories.

### Steps

1. **Fork the Repository**
   ```bash
   gh repo fork langchain-ai/langchain --org=pylon-apis
   cd langchain
   ```

2. **Create Partner Package**
   Based on the investigation, LangChain now uses partner packages for integrations. Create a new partner package:
   ```bash
   # Copy the structure from an existing partner (e.g., openai)
   cp -r libs/partners/openai libs/partners/pylon
   cd libs/partners/pylon
   ```

3. **Update Package Structure**
   - Rename `langchain_openai` to `langchain_pylon`
   - Update `pyproject.toml` with Pylon package details
   - Replace OpenAI-specific code with Pylon integration
   - Update `__init__.py` to export Pylon tools

4. **Copy Integration Files**
   ```bash
   # Copy our prepared files
   cp /path/to/pylon-integrations/langchain/pylon_tool.py libs/partners/pylon/langchain_pylon/tools/
   cp /path/to/pylon-integrations/langchain/README.md libs/partners/pylon/
   cp /path/to/pylon-integrations/langchain/setup.py libs/partners/pylon/
   ```

5. **Update pyproject.toml**
   Replace the OpenAI references with Pylon configuration matching our `setup.py`.

6. **Create Tests**
   ```bash
   # Update test files in tests/ directory
   # Follow the pattern of other partner packages
   ```

7. **Create PR**
   ```bash
   git checkout -b feat/pylon-integration
   git add .
   git commit -m "feat: Add Pylon API Gateway integration

   - Add Pylon partner package with 20+ AI capabilities
   - Includes tools for screenshot, search, scrape, OCR, translation
   - Uses x402 payment protocol (no API keys required)
   - Comprehensive documentation and examples included"
   git push origin feat/pylon-integration
   gh pr create --title "feat: Add Pylon API Gateway integration" \
     --body-file PR_BODY_LANGCHAIN.md
   ```

## 2. CrewAI Integration

### Repository Structure
CrewAI has a `src/crewai/tools/` directory for community tools.

### Steps

1. **Fork the Repository**
   ```bash
   gh repo fork crewAIInc/crewAI --org=pylon-apis
   cd crewAI
   ```

2. **Investigate Tools Structure**
   ```bash
   # Check current tools structure
   ls -la src/crewai/tools/
   ```

3. **Add Pylon Tools**
   ```bash
   # Copy our integration
   cp /path/to/pylon-integrations/crewai/pylon_tool.py src/crewai/tools/
   
   # Update __init__.py to export Pylon tools
   echo "from .pylon_tool import PylonTool, PylonSearchTool, PylonScreenshotTool, PylonScrapeTool" >> src/crewai/tools/__init__.py
   ```

4. **Add Documentation**
   ```bash
   # Add example in docs or examples directory
   mkdir -p examples/pylon_integration
   cp /path/to/pylon-integrations/crewai/example.py examples/pylon_integration/
   cp /path/to/pylon-integrations/crewai/README.md examples/pylon_integration/
   ```

5. **Create PR**
   ```bash
   git checkout -b feat/pylon-tools-integration
   git add .
   git commit -m "feat: Add Pylon API Gateway tools integration

   - Add PylonTool, PylonSearchTool, PylonScreenshotTool, PylonScrapeTool
   - Provides access to 20+ AI capabilities via Pylon API Gateway
   - Uses x402 payment protocol (no API keys required)
   - Includes comprehensive examples and documentation"
   git push origin feat/pylon-tools-integration
   gh pr create --title "feat: Add Pylon API Gateway tools integration" \
     --body-file PR_BODY_CREWAI.md
   ```

## 3. Vercel AI SDK Integration

### Repository Structure
Vercel AI SDK has an `examples/` directory and may accept community tool examples.

### Strategy
Since Vercel AI SDK may not accept direct tool integrations, we'll create a comprehensive example and potentially suggest it as a community addition.

### Steps

1. **Fork the Repository**
   ```bash
   gh repo fork vercel/ai --org=pylon-apis
   cd ai
   ```

2. **Investigate Examples Structure**
   ```bash
   ls -la examples/
   ```

3. **Create Pylon Example**
   ```bash
   mkdir -p examples/pylon-integration
   cp -r /path/to/pylon-integrations/vercel-ai/* examples/pylon-integration/
   ```

4. **Create Complete Example App**
   ```bash
   cd examples/pylon-integration
   npm init -y
   # Set up a complete Next.js app demonstrating Pylon integration
   ```

5. **Create PR or Issue**
   Depending on their contribution guidelines:
   ```bash
   git checkout -b feat/pylon-integration-example
   git add .
   git commit -m "feat: Add Pylon API Gateway integration example

   - Complete Next.js example using Pylon tools with AI SDK
   - Demonstrates 20+ AI capabilities including screenshot, search, scrape
   - Uses x402 payment protocol (no API keys required)
   - TypeScript-first with full type safety"
   git push origin feat/pylon-integration-example
   gh pr create --title "feat: Add Pylon API Gateway integration example" \
     --body-file PR_BODY_VERCEL.md
   ```

## PR Body Templates

### LangChain PR Body
```markdown
## Overview
This PR adds a new partner package for [Pylon API Gateway](https://pylonapi.com) integration, providing LangChain agents with access to 20+ AI capabilities including screenshot capture, web scraping, search, PDF processing, OCR, translation, and more.

## Key Features
- 🚀 **No API Keys Required** - Uses x402 payment protocol (USDC on Base)
- 🛠️ **20+ AI Capabilities** - Screenshot, search, scrape, PDF extract, OCR, translate, etc.
- 🔧 **LangChain Native** - Follows LangChain tool patterns and conventions
- ⚡ **Production Ready** - Battle-tested API gateway
- 💰 **Pay-per-Use** - Only pay for successful requests via micropayments

## Implementation Details
- Created new partner package `langchain-pylon` following LangChain's partner architecture
- Implements `BaseTool` with proper input validation using Pydantic
- Includes both generic `PylonTool` and specialized tools for common use cases
- Comprehensive error handling and type hints
- Full documentation with examples

## Testing
- Unit tests following LangChain testing patterns
- Integration tests with Pylon API Gateway
- Example usage with different agent types

This integration enables LangChain agents to perform complex web interactions and data processing tasks through Pylon's unified API interface.
```

### CrewAI PR Body  
```markdown
## Overview
This PR adds Pylon API Gateway tool integrations for CrewAI, enabling agents to access 20+ AI capabilities including screenshot capture, web scraping, search, PDF processing, OCR, translation, and more.

## Key Features
- 🚀 **No API Keys Required** - Uses x402 payment protocol (USDC on Base)  
- 🛠️ **20+ AI Capabilities** - Screenshot, search, scrape, PDF extract, OCR, translate, etc.
- 🔧 **CrewAI Native** - Follows CrewAI tool patterns using `BaseTool`
- ⚡ **Agent Ready** - Designed for multi-agent workflows
- 💰 **Pay-per-Use** - Only pay for successful requests via micropayments

## Implementation Details
- `PylonTool` - Generic access to all Pylon capabilities
- `PylonSearchTool` - Specialized web search tool
- `PylonScreenshotTool` - Website screenshot capture tool  
- `PylonScrapeTool` - Web content extraction tool
- All tools inherit from `BaseTool` and follow CrewAI conventions
- Comprehensive error handling and documentation
- Example crew demonstrating multi-agent usage

## Use Cases
Perfect for research crews, content analysis teams, and agents that need to interact with external web resources and process various data formats.
```

### Vercel AI SDK PR Body
```markdown
## Overview
This PR adds a comprehensive example demonstrating Pylon API Gateway integration with the Vercel AI SDK, showcasing how to build AI agents with 20+ capabilities including screenshot capture, web scraping, search, PDF processing, OCR, translation, and more.

## Key Features
- 🚀 **No API Keys Required** - Uses x402 payment protocol (USDC on Base)
- 🛠️ **20+ AI Capabilities** - Screenshot, search, scrape, PDF extract, OCR, translate, etc.  
- 🔧 **TypeScript Native** - Full TypeScript support with Zod validation
- ⚡ **Production Ready** - Complete Next.js application example
- 🎯 **Agent Focused** - Built for ToolLoopAgent workflows
- 💰 **Pay-per-Use** - Only pay for successful requests via micropayments

## Implementation Details
- Complete TypeScript tool definitions with Zod schemas
- Multiple agent examples (research, content processing, etc.)
- Next.js API routes demonstrating backend integration
- React components with real-time AI interactions
- Comprehensive documentation and setup instructions
- Production-ready error handling and user experience

## Example Features Demonstrated
- Research agent that can search web and capture screenshots
- Content processing agent for translation and OCR
- Multi-capability workflows combining different AI tools
- Streaming responses with tool invocation UI

This example shows how developers can easily integrate powerful AI capabilities into their Vercel AI SDK applications through Pylon's unified API interface.
```

## Post-PR Actions

1. **Monitor PR Status**: Check for feedback and address any requested changes
2. **Community Engagement**: Engage with maintainers' feedback professionally
3. **Documentation Updates**: Update docs if integration patterns change
4. **Alternative Distribution**: If PRs are not accepted, distribute as standalone packages:
   - Publish to npm (Vercel AI SDK tools)
   - Publish to PyPI (LangChain and CrewAI tools)
   - Document in main Pylon repository

## Backup Plan

If any framework doesn't accept the integration PR:

1. **Create standalone packages** in the main Pylon repository
2. **Publish to package registries** (npm/PyPI)
3. **Document integration** in Pylon documentation
4. **Create tutorials** showing how to use the integrations
5. **Engage with communities** through Discord/forums to promote adoption
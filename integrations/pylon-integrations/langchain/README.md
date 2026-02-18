# LangChain Pylon Integration

This package provides LangChain tools for interacting with the [Pylon API Gateway](https://pylonapi.com), giving your AI agents access to 20+ capabilities including screenshot capture, web scraping, search, PDF processing, OCR, translation, and more.

## Features

- 🚀 **No API Keys Required** - Uses x402 payment protocol (USDC on Base)
- 🛠️ **20+ AI Capabilities** - Screenshot, search, scrape, PDF extract, OCR, translate, etc.
- 🔧 **Easy Integration** - Drop-in tools for LangChain agents
- ⚡ **Fast & Reliable** - Production-ready API gateway
- 💰 **Pay-per-Use** - Only pay for what you use via micropayments

## Installation

```bash
pip install langchain-pylon
```

Or install from source:
```bash
pip install requests pydantic langchain
```

## Quick Start

```python
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from pylon_tool import PylonTool, create_pylon_screenshot_tool, create_pylon_search_tool

# Initialize LLM
llm = ChatOpenAI(model="gpt-4", temperature=0)

# Create Pylon tools
pylon_tool = PylonTool()
screenshot_tool = create_pylon_screenshot_tool()
search_tool = create_pylon_search_tool()

tools = [pylon_tool, screenshot_tool, search_tool]

# Create agent
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant with access to various AI capabilities via Pylon."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_openai_functions_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

# Use the agent
result = agent_executor.invoke({
    "input": "Search for the latest AI news and take a screenshot of the top result"
})
print(result["output"])
```

## Available Tools

### PylonTool
The main tool that provides access to all Pylon capabilities:

```python
from pylon_tool import PylonTool

tool = PylonTool()
# Use with capability and params
```

### Specialized Tools
Pre-configured tools for common use cases:

```python
from pylon_tool import (
    create_pylon_screenshot_tool,
    create_pylon_search_tool, 
    create_pylon_scrape_tool
)

screenshot_tool = create_pylon_screenshot_tool()
search_tool = create_pylon_search_tool()
scrape_tool = create_pylon_scrape_tool()
```

## Supported Capabilities

- **screenshot** - Capture web page screenshots
- **search** - Web search with multiple engines
- **web-scrape** - Extract content from web pages
- **pdf-extract** - Extract text from PDF files
- **ocr** - Optical character recognition from images
- **translate** - Language translation
- And many more...

## Usage Examples

### Web Search
```python
# Using the generic tool
result = pylon_tool._run("search", {"query": "AI news 2025", "count": 5})

# Using the specialized tool
result = search_tool._run("AI news 2025", {})
```

### Screenshot
```python
# Using the generic tool
result = pylon_tool._run("screenshot", {"url": "https://example.com"})

# Using the specialized tool
result = screenshot_tool._run("https://example.com", {})
```

### Web Scraping
```python
result = pylon_tool._run("web-scrape", {
    "url": "https://example.com",
    "selector": ".main-content"
})
```

### PDF Processing
```python
result = pylon_tool._run("pdf-extract", {
    "url": "https://example.com/document.pdf",
    "pages": [1, 2, 3]
})
```

### OCR
```python
result = pylon_tool._run("ocr", {
    "url": "https://example.com/image.jpg",
    "language": "en"
})
```

### Translation
```python
result = pylon_tool._run("translate", {
    "text": "Hello world",
    "from": "en",
    "to": "es"
})
```

## Payment

Pylon uses the x402 payment protocol with USDC on Base network. No upfront API keys or subscriptions required - you only pay for successful requests via micropayments.

## Error Handling

The tools include comprehensive error handling and will return descriptive error messages for debugging:

```python
try:
    result = pylon_tool._run("screenshot", {"url": "invalid-url"})
    print(result)
except Exception as e:
    print(f"Error: {e}")
```

## Contributing

This integration is part of the open-source Pylon project. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- 📖 **Documentation**: [docs.pylonapi.com](https://docs.pylonapi.com)
- 🐛 **Issues**: [GitHub Issues](https://github.com/pylon-apis/pylon/issues)
- 💬 **Community**: [Discord](https://discord.gg/pylon-api)
- 🌐 **Website**: [pylonapi.com](https://pylonapi.com)
# CrewAI Pylon Integration

This package provides CrewAI tools for interacting with the [Pylon API Gateway](https://pylonapi.com), giving your AI agents access to 20+ capabilities including screenshot capture, web scraping, search, PDF processing, OCR, translation, and more.

## Features

- 🚀 **No API Keys Required** - Uses x402 payment protocol (USDC on Base)
- 🛠️ **20+ AI Capabilities** - Screenshot, search, scrape, PDF extract, OCR, translate, etc.
- 🔧 **Easy Integration** - Drop-in tools for CrewAI agents
- ⚡ **Fast & Reliable** - Production-ready API gateway
- 💰 **Pay-per-Use** - Only pay for what you use via micropayments

## Installation

```bash
pip install crewai-pylon
```

Or install from source:
```bash
pip install crewai crewai-tools requests pydantic
```

## Quick Start

```python
from crewai import Agent, Task, Crew, Process
from pylon_tool import PylonTool, PylonSearchTool, PylonScreenshotTool

# Create Pylon tools
pylon_tool = PylonTool()
search_tool = PylonSearchTool()
screenshot_tool = PylonScreenshotTool()

# Create an agent with Pylon capabilities
researcher = Agent(
    role='Web Researcher',
    goal='Research topics using web search and screenshots',
    backstory='Expert researcher with access to advanced AI tools.',
    tools=[search_tool, screenshot_tool, pylon_tool],
    verbose=True
)

# Create a research task
research_task = Task(
    description='Research the latest AI developments and capture screenshots of key websites',
    expected_output='Comprehensive research report with visual evidence',
    agent=researcher
)

# Create and run the crew
crew = Crew(
    agents=[researcher],
    tasks=[research_task],
    process=Process.sequential,
    verbose=True
)

result = crew.kickoff()
print(result)
```

## Available Tools

### PylonTool
The main tool that provides access to all Pylon capabilities:

```python
from pylon_tool import PylonTool

tool = PylonTool()
# Use with capability and params in the _run method
```

### Specialized Tools
Pre-configured tools for common use cases:

```python
from pylon_tool import (
    PylonScreenshotTool,
    PylonSearchTool,
    PylonScrapeTool
)

screenshot_tool = PylonScreenshotTool()
search_tool = PylonSearchTool()
scrape_tool = PylonScrapeTool()
```

## Tool Usage in CrewAI

### Generic Pylon Tool
```python
# Access any Pylon capability
result = pylon_tool._run("screenshot", {"url": "https://example.com"})
result = pylon_tool._run("search", {"query": "AI news"})
result = pylon_tool._run("translate", {"text": "Hello", "to": "es"})
```

### Specialized Tools
```python
# Web search
result = search_tool._run("AI developments 2025")

# Screenshot
result = screenshot_tool._run("https://openai.com")

# Web scraping
result = scrape_tool._run("https://example.com")
```

## Complete Example

```python
from crewai import Agent, Task, Crew, Process
from pylon_tool import PylonTool, PylonSearchTool, PylonScreenshotTool, PylonScrapeTool

# Create tools
pylon_tool = PylonTool()
search_tool = PylonSearchTool()
screenshot_tool = PylonScreenshotTool()
scrape_tool = PylonScrapeTool()

# Define agents
researcher = Agent(
    role='Senior Researcher',
    goal='Find and analyze web information comprehensively',
    backstory='''You're an expert researcher who uses multiple tools to gather
    comprehensive information from the web.''',
    tools=[search_tool, scrape_tool],
    verbose=True
)

analyst = Agent(
    role='Visual Analyst', 
    goal='Capture and analyze visual content from websites',
    backstory='''You're a visual analyst who captures screenshots and analyzes
    web interfaces to provide visual insights.''',
    tools=[screenshot_tool, scrape_tool],
    verbose=True
)

# Define tasks
research_task = Task(
    description='''Research the latest developments in AI agent frameworks.
    Search for recent articles and scrape detailed content from the most relevant sources.''',
    expected_output='Detailed research findings with scraped content',
    agent=researcher
)

visual_task = Task(
    description='''Take screenshots of the top AI framework websites mentioned
    in the research. Analyze their visual design and key features.''',
    expected_output='Visual analysis with screenshots and insights',
    agent=analyst
)

# Create crew
research_crew = Crew(
    agents=[researcher, analyst],
    tasks=[research_task, visual_task],
    process=Process.sequential,
    verbose=True
)

# Execute
result = research_crew.kickoff()
```

## Supported Capabilities

- **screenshot** - Capture web page screenshots
- **search** - Web search with multiple engines  
- **web-scrape** - Extract content from web pages
- **pdf-extract** - Extract text from PDF files
- **ocr** - Optical character recognition from images
- **translate** - Language translation
- **audio-transcribe** - Convert audio to text
- **image-generate** - Generate images from text
- **email-send** - Send emails
- **calendar-event** - Create calendar events
- And many more...

## Agent Configuration

### Basic Agent with Pylon Tools
```python
agent = Agent(
    role='Research Assistant',
    goal='Help with research and web analysis',
    backstory='AI assistant with web capabilities',
    tools=[PylonSearchTool(), PylonScreenshotTool()],
    verbose=True,
    allow_delegation=False
)
```

### Multi-Tool Agent
```python
multi_tool_agent = Agent(
    role='Multi-Capability Agent',
    goal='Handle diverse tasks using various AI tools',
    backstory='Versatile AI agent with access to multiple capabilities',
    tools=[
        PylonTool(),  # Generic access to all capabilities
        PylonSearchTool(),
        PylonScreenshotTool(), 
        PylonScrapeTool()
    ],
    verbose=True
)
```

## Payment

Pylon uses the x402 payment protocol with USDC on Base network. No upfront API keys or subscriptions required - you only pay for successful requests via micropayments.

## Error Handling

All tools include comprehensive error handling:

```python
try:
    result = screenshot_tool._run("https://invalid-url")
    print(result)
except Exception as e:
    print(f"Tool execution failed: {e}")
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
"""LangChain tool integration for Pylon API Gateway."""

from typing import Any, Dict, List, Optional, Type
import json
import requests
from pydantic import BaseModel, Field

from langchain.tools import BaseTool


class PylonInput(BaseModel):
    """Input schema for Pylon tool."""
    capability: str = Field(description="The capability to execute (e.g., 'screenshot', 'search', 'pdf-extract')")
    params: Dict[str, Any] = Field(description="Parameters for the capability", default_factory=dict)


class PylonTool(BaseTool):
    """
    Tool for interacting with Pylon API Gateway.
    
    Pylon provides 20+ AI capabilities including screenshot, web scraping, search,
    PDF processing, OCR, translation, and more via a simple API gateway.
    
    Payment is handled via x402 protocol (USDC on Base) with no API keys required.
    """
    
    name: str = "pylon"
    description: str = (
        "Access 20+ AI capabilities via Pylon API Gateway including: "
        "screenshot (capture web pages), search (web search), "
        "web-scrape (extract web content), pdf-extract (extract text from PDFs), "
        "ocr (optical character recognition), translate (language translation), "
        "and many more. Uses x402 payment protocol - no API keys needed."
    )
    args_schema: Type[BaseModel] = PylonInput
    
    gateway_url: str = "https://pylon-gateway-api.fly.dev"
    
    def _run(
        self,
        capability: str,
        params: Dict[str, Any],
        run_manager: Optional[Any] = None,
    ) -> str:
        """Execute a capability via Pylon API Gateway."""
        try:
            payload = {
                "capability": capability,
                "params": params
            }
            
            response = requests.post(
                f"{self.gateway_url}/do",
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                return json.dumps(result, indent=2)
            else:
                return f"Error: HTTP {response.status_code} - {response.text}"
                
        except requests.RequestException as e:
            return f"Request failed: {str(e)}"
        except json.JSONDecodeError as e:
            return f"JSON decode error: {str(e)}"
        except Exception as e:
            return f"Unexpected error: {str(e)}"
    
    async def _arun(
        self,
        capability: str,
        params: Dict[str, Any],
        run_manager: Optional[Any] = None,
    ) -> str:
        """Execute a capability via Pylon API Gateway (async)."""
        # For simplicity, we'll use the sync version
        # In a production environment, you'd want to use aiohttp
        return self._run(capability, params, run_manager)


# Convenience functions for common capabilities
def create_pylon_screenshot_tool() -> PylonTool:
    """Create a Pylon tool specialized for screenshots."""
    tool = PylonTool()
    tool.name = "pylon_screenshot"
    tool.description = (
        "Capture screenshots of web pages using Pylon. "
        "Provide a URL in params as {'url': 'https://example.com'}."
    )
    return tool


def create_pylon_search_tool() -> PylonTool:
    """Create a Pylon tool specialized for web search."""
    tool = PylonTool()
    tool.name = "pylon_search"
    tool.description = (
        "Search the web using Pylon. "
        "Provide a query in params as {'query': 'your search terms'}."
    )
    return tool


def create_pylon_scrape_tool() -> PylonTool:
    """Create a Pylon tool specialized for web scraping."""
    tool = PylonTool()
    tool.name = "pylon_scrape"
    tool.description = (
        "Scrape and extract content from web pages using Pylon. "
        "Provide a URL in params as {'url': 'https://example.com'}."
    )
    return tool
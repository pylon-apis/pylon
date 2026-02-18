"""CrewAI tool integration for Pylon API Gateway."""

from typing import Any, Dict, Optional, Type
import json
import requests
from pydantic import BaseModel, Field

from crewai_tools import BaseTool


class PylonToolInput(BaseModel):
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
    
    name: str = "Pylon API Gateway"
    description: str = (
        "Access 20+ AI capabilities via Pylon API Gateway including: "
        "screenshot (capture web pages), search (web search), "
        "web-scrape (extract web content), pdf-extract (extract text from PDFs), "
        "ocr (optical character recognition), translate (language translation), "
        "and many more. Uses x402 payment protocol - no API keys needed. "
        "Format: {'capability': 'capability_name', 'params': {'param_key': 'param_value'}}"
    )
    args_schema: Type[BaseModel] = PylonToolInput
    
    gateway_url: str = "https://pylon-gateway-api.fly.dev"
    
    def _run(self, capability: str, params: Dict[str, Any]) -> str:
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


class PylonScreenshotTool(BaseTool):
    """Specialized Pylon tool for taking screenshots."""
    
    name: str = "Pylon Screenshot"
    description: str = (
        "Capture screenshots of web pages using Pylon. "
        "Provide the URL to screenshot. Example: 'https://example.com'"
    )
    
    gateway_url: str = "https://pylon-gateway-api.fly.dev"
    
    def _run(self, url: str) -> str:
        """Take a screenshot of the specified URL."""
        try:
            payload = {
                "capability": "screenshot",
                "params": {"url": url}
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
                
        except Exception as e:
            return f"Screenshot failed: {str(e)}"


class PylonSearchTool(BaseTool):
    """Specialized Pylon tool for web search."""
    
    name: str = "Pylon Search"
    description: str = (
        "Search the web using Pylon. "
        "Provide search query terms. Example: 'AI news 2025'"
    )
    
    gateway_url: str = "https://pylon-gateway-api.fly.dev"
    
    def _run(self, query: str) -> str:
        """Search the web with the specified query."""
        try:
            payload = {
                "capability": "search",
                "params": {"query": query}
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
                
        except Exception as e:
            return f"Search failed: {str(e)}"


class PylonScrapeTool(BaseTool):
    """Specialized Pylon tool for web scraping."""
    
    name: str = "Pylon Scraper"
    description: str = (
        "Scrape and extract content from web pages using Pylon. "
        "Provide the URL to scrape. Example: 'https://example.com'"
    )
    
    gateway_url: str = "https://pylon-gateway-api.fly.dev"
    
    def _run(self, url: str) -> str:
        """Scrape content from the specified URL."""
        try:
            payload = {
                "capability": "web-scrape",
                "params": {"url": url}
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
                
        except Exception as e:
            return f"Scraping failed: {str(e)}"
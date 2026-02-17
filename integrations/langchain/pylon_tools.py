"""Pylon API Tools for LangChain — x402 pay-per-request utility APIs for AI agents.

Install: pip install langchain-core httpx
Usage:
    from pylon_tools import PylonScreenshot, PylonPDFParse, PylonOCR
    
    tool = PylonScreenshot()
    result = tool.invoke({"url": "https://example.com"})
"""

from typing import Optional, Type
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
import httpx
import base64


PYLON_BASE_URLS = {
    "screenshot": "https://pylon-screenshot-api.fly.dev",
    "pdf_parse": "https://pylon-pdf-parse-api.fly.dev",
    "ocr": "https://pylon-ocr-api.fly.dev",
    "email_validate": "https://pylon-email-validate-api.fly.dev",
    "domain_intel": "https://pylon-domain-intel-api.fly.dev",
    "qr_code": "https://pylon-qr-code-api.fly.dev",
    "image_resize": "https://pylon-image-resize-api.fly.dev",
    "md_to_pdf": "https://pylon-md-to-pdf-api.fly.dev",
    "html_to_pdf": "https://pylon-html-to-pdf-api.fly.dev",
}


def _call_pylon(url: str, params: dict = None, method: str = "GET", json_body: dict = None) -> dict:
    """Make an x402-aware request to a Pylon API.
    
    This is a simplified client. For production use with automatic x402 payment,
    use the @pylon-apis/x402-client or implement the x402 payment flow:
    1. Send request → get 402 with payment details
    2. Pay via x402 facilitator
    3. Retry with X-Payment header
    """
    with httpx.Client(timeout=30) as client:
        if method == "GET":
            resp = client.get(url, params=params)
        else:
            resp = client.post(url, json=json_body)
        
        if resp.status_code == 402:
            return {
                "error": "payment_required",
                "message": "This API requires x402 micropayment. See https://pylonapi.com for details.",
                "payment_details": resp.json() if resp.headers.get("content-type", "").startswith("application/json") else resp.text
            }
        
        content_type = resp.headers.get("content-type", "")
        if "application/json" in content_type:
            return resp.json()
        elif "image/" in content_type or "application/pdf" in content_type:
            return {
                "content_type": content_type,
                "data_base64": base64.b64encode(resp.content).decode(),
                "size_bytes": len(resp.content)
            }
        else:
            return {"text": resp.text}


# --- Screenshot Tool ---

class ScreenshotInput(BaseModel):
    url: str = Field(description="URL of the webpage to screenshot")
    width: Optional[int] = Field(default=1280, description="Viewport width in pixels")
    height: Optional[int] = Field(default=720, description="Viewport height in pixels")
    full_page: Optional[bool] = Field(default=False, description="Capture full scrollable page")
    format: Optional[str] = Field(default="png", description="Image format: png or jpeg")


class PylonScreenshot(BaseTool):
    name: str = "pylon_screenshot"
    description: str = (
        "Take a screenshot of any webpage. Returns PNG/JPEG image. "
        "Costs $0.01 per request via x402 micropayment. "
        "Useful for capturing visual state of websites, verifying deployments, "
        "or getting visual context about a URL."
    )
    args_schema: Type[BaseModel] = ScreenshotInput

    def _run(self, url: str, width: int = 1280, height: int = 720, 
             full_page: bool = False, format: str = "png") -> dict:
        params = {
            "url": url,
            "width": width,
            "height": height,
            "fullPage": full_page,
            "format": format,
        }
        return _call_pylon(f"{PYLON_BASE_URLS['screenshot']}/screenshot", params=params)


# --- PDF Parse Tool ---

class PDFParseInput(BaseModel):
    url: str = Field(description="URL of the PDF to parse")


class PylonPDFParse(BaseTool):
    name: str = "pylon_pdf_parse"
    description: str = (
        "Extract text and metadata from a PDF document by URL. "
        "Costs $0.02 per request via x402. "
        "Returns extracted text, page count, and document metadata."
    )
    args_schema: Type[BaseModel] = PDFParseInput

    def _run(self, url: str) -> dict:
        return _call_pylon(f"{PYLON_BASE_URLS['pdf_parse']}/parse", params={"url": url})


# --- OCR Tool ---

class OCRInput(BaseModel):
    url: str = Field(description="URL of the image to OCR")
    language: Optional[str] = Field(default="eng", description="OCR language (e.g., eng, spa, fra)")


class PylonOCR(BaseTool):
    name: str = "pylon_ocr"
    description: str = (
        "Extract text from an image using OCR (Optical Character Recognition). "
        "Costs $0.03 per request via x402. "
        "Supports multiple languages. Pass an image URL."
    )
    args_schema: Type[BaseModel] = OCRInput

    def _run(self, url: str, language: str = "eng") -> dict:
        return _call_pylon(f"{PYLON_BASE_URLS['ocr']}/ocr", params={"url": url, "language": language})


# --- Email Validate Tool ---

class EmailValidateInput(BaseModel):
    email: str = Field(description="Email address to validate")


class PylonEmailValidate(BaseTool):
    name: str = "pylon_email_validate"
    description: str = (
        "Validate an email address — checks format, MX records, and SMTP deliverability. "
        "Costs $0.005 per request via x402. "
        "Returns whether the email is valid, deliverable, and if it's a disposable address."
    )
    args_schema: Type[BaseModel] = EmailValidateInput

    def _run(self, email: str) -> dict:
        return _call_pylon(f"{PYLON_BASE_URLS['email_validate']}/validate", params={"email": email})


# --- Domain Intel Tool ---

class DomainIntelInput(BaseModel):
    domain: str = Field(description="Domain name to analyze (e.g., example.com)")


class PylonDomainIntel(BaseTool):
    name: str = "pylon_domain_intel"
    description: str = (
        "Get intelligence on a domain — WHOIS data, DNS records, SSL certificate info, "
        "and technology stack detection. Costs $0.01 per request via x402."
    )
    args_schema: Type[BaseModel] = DomainIntelInput

    def _run(self, domain: str) -> dict:
        return _call_pylon(f"{PYLON_BASE_URLS['domain_intel']}/intel", params={"domain": domain})


# --- QR Code Tool ---

class QRCodeInput(BaseModel):
    data: str = Field(description="Data to encode in the QR code (URL, text, etc.)")
    size: Optional[int] = Field(default=300, description="QR code size in pixels")


class PylonQRCode(BaseTool):
    name: str = "pylon_qr_code"
    description: str = (
        "Generate a QR code image from text or a URL. "
        "Costs $0.005 per request via x402. Returns PNG image."
    )
    args_schema: Type[BaseModel] = QRCodeInput

    def _run(self, data: str, size: int = 300) -> dict:
        return _call_pylon(f"{PYLON_BASE_URLS['qr_code']}/generate", params={"data": data, "size": size})


if __name__ == "__main__":
    # Quick test — will return 402 without payment, which is expected
    tool = PylonScreenshot()
    result = tool.invoke({"url": "https://example.com"})
    print(result)

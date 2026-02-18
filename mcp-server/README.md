# ⚡ Pylon MCP Server

Give Claude, Cursor, and any MCP client access to **17+ capabilities** — screenshots, web scraping, PDF generation, search, and more. The action layer for AI agents.

## Quick Start

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pylon": {
      "command": "npx",
      "args": ["-y", "@pylonapi/mcp"],
      "env": {
        "PYLON_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "pylon": {
      "command": "npx",
      "args": ["-y", "@pylonapi/mcp"],
      "env": {
        "PYLON_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Run directly

```bash
PYLON_API_KEY=your-key npx @pylonapi/mcp
```

## Available Tools

### Per-Capability Tools
Each Pylon capability is exposed as a dedicated tool:

| Tool | Cost | Description |
|------|------|-------------|
| `pylon_screenshot` | $0.01 | Screenshot any webpage |
| `pylon_web_scrape` | $0.01 | Scrape content from any URL |
| `pylon_search` | $0.003 | Web search |
| `pylon_pdf_parse` | $0.02 | Extract text from PDFs |
| `pylon_ocr` | $0.03 | Extract text from images |
| `pylon_md_to_pdf` | $0.02 | Convert markdown to PDF |
| `pylon_html_to_pdf` | $0.02 | Convert HTML to PDF |
| `pylon_email_validate` | $0.005 | Validate email addresses |
| `pylon_domain_intel` | $0.01 | Domain intelligence (WHOIS, DNS, SSL) |
| `pylon_qr_code` | $0.005 | Generate QR codes |
| `pylon_image_resize` | $0.01 | Resize/convert images |
| `pylon_doc_gen` | $0.02 | Generate documents from templates |
| `pylon_file_storage` | $0.005 | Upload and host files |
| `pylon_url_shortener` | $0.002 | Shorten URLs |
| `pylon_data_formatter` | $0.002 | Convert JSON/CSV/XML/YAML |
| `pylon_ip_geo` | $0.002 | IP geolocation |
| `pylon_dns_lookup` | $0.002 | DNS record lookups |

### Meta Tools
| Tool | Description |
|------|-------------|
| `pylon_do` | Natural language — describe any task and Pylon routes it |
| `pylon_chain` | Multi-step workflows — chain actions in a single request |
| `pylon_discover` | Search for capabilities on the x402 bazaar |

### Resources
| Resource | Description |
|----------|-------------|
| `pylon://capabilities` | Full capability list with schemas and pricing |
| `pylon://status` | Live service status and circuit breaker states |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PYLON_API_KEY` | — | API key for authentication |
| `PYLON_GATEWAY_URL` | `https://api.pylonapi.com` | Gateway URL (override for self-hosted) |

## How It Works

1. Claude/Cursor sees Pylon's tools via MCP
2. User asks "take a screenshot of stripe.com"
3. Claude calls `pylon_screenshot` with `{ "url": "https://stripe.com" }`
4. MCP server sends the request to Pylon's gateway
5. Gateway executes and returns the result
6. Claude shows the screenshot to the user

All payment handling happens automatically via x402 on Base.

## Links

- [Pylon Website](https://pylonapi.com)
- [GitHub](https://github.com/pylon-apis/pylon)
- [x402 Protocol](https://x402.org)

## License

MIT

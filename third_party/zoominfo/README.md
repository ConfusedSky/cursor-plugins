# ZoomInfo

Cursor plugin that connects agents to [ZoomInfo](https://www.zoominfo.com) through ZoomInfo's official remote [Model Context Protocol](https://modelcontextprotocol.io/) server.

Search companies and contacts, enrich records with firmographics and verified contact details, surface buyer intent signals, scoops, and news, and generate account and contact research briefings.

## Install

1. Open **Cursor Settings → Plugins**.
2. Search for **ZoomInfo**.
3. Click **Install**, then complete the ZoomInfo sign-in prompt.

Or run `/add-plugin zoominfo` in chat.

## MCP

```json
{
  "mcpServers": {
    "zoominfo": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@0.1.38",
        "https://mcp.zoominfo.com/mcp",
        "46818",
        "--static-oauth-client-metadata",
        "{\"scope\":\"openid profile email offline_access zi_api zi_mcp api:data:mcp\"}"
      ]
    }
  }
}
```

ZoomInfo's server does not yet complete OAuth discovery with Cursor's native HTTP client, so the plugin connects through the `mcp-remote` stdio bridge, which runs the OAuth flow locally. This needs Node.js (`npx`) on your machine.

Auth is OAuth 2.0 against ZoomInfo, including organization SSO. The bridge opens ZoomInfo sign-in in your browser on first connect and reuses cached tokens afterwards — there is no API key to configure.

## Before you connect

ZoomInfo prohibits AI model training on data accessed through ZoomInfo MCP. Turn model training off in your Cursor privacy settings before connecting.

You also need a ZoomInfo license (GTM.ai self-serve or Enterprise). Your plan's API limits, credits, and feature availability all apply to MCP usage.

## Notes

- Tool calls respect the role-based permissions of the ZoomInfo user who authorizes the connection.
- Search is free; enrichment and research tools consume bulk data or AI action credits.

## Docs

- ZoomInfo MCP overview: https://docs.zoominfo.com/docs/zi-api-mcp-overview
- Connect ZoomInfo MCP: https://docs.zoominfo.com/docs/connect-to-zoominfo-mcp
- Available MCP tools: https://docs.zoominfo.com/docs/available-mcp-tools

Logo is ZoomInfo's brand mark on the brand red tile, sized to match the other third-party plugin logos.

## License

MIT

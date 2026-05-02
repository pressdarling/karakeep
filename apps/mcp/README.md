# Karakeep MCP Server

This is the Karakeep MCP server, which is a server that can be used to interact
with Karakeep from other tools.

## Supported Tools

- Searching bookmarks
- Adding and removing bookmarks from lists
- Attaching and detaching tags to bookmarks
- Creating new lists
- Creating text and URL bookmarks

The stdio entrypoint exposes Karakeep tools for local MCP clients. The HTTP
entrypoint below exposes the same tools plus a ChatGPT Apps widget resource.

## Usage with ChatGPT Apps

ChatGPT Apps require an HTTP MCP endpoint. The stdio entrypoint above remains
available for local MCP clients, and the HTTP entrypoint exposes the same tools
plus a bookmark search widget.

```sh
pnpm --filter @karakeep/mcp run build
KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR> \
KARAKEEP_API_KEY=<YOUR_TOKEN> \
pnpm --filter @karakeep/mcp run run:http
```

By default, the HTTP server listens on `http://localhost:8787/mcp`. Override the
port with `PORT` or `KARAKEEP_MCP_PORT`.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` / `KARAKEEP_MCP_PORT` | `8787` | TCP port for the HTTP server |
| `KARAKEEP_MCP_PATH` | `/mcp` | URL path for the MCP endpoint |
| `KARAKEEP_MCP_ALLOWED_ORIGINS` | *(unset — all origins allowed)* | Comma-separated list of trusted origins for CORS (e.g. `https://chatgpt.com`). When unset, all origins are accepted (`*`), which is suitable for local development but should be restricted in production. |
| `KARAKEEP_CHATGPT_APP_DOMAIN` | *(unset)* | The domain of the ChatGPT App embedding the widget (e.g. `https://chatgpt.com`). When set, the widget's `postMessage` calls are scoped to this origin instead of `*`. |

For local ChatGPT testing, expose the local server over HTTPS and use the `/mcp`
path when creating the app in ChatGPT Developer Mode:

```sh
ngrok http 8787
```

Then paste `https://<subdomain>.ngrok.app/mcp` into ChatGPT's app connector
settings. Refresh the app after changing tool metadata or widget resources so
ChatGPT reloads the descriptors.

## Usage with Claude Desktop

From NPM:

```json
{
  "mcpServers": {
    "karakeep": {
      "command": "npx",
      "args": [
        "@karakeep/mcp"
      ],
      "env": {
        "KARAKEEP_API_ADDR": "https://<YOUR_SERVER_ADDR>",
        "KARAKEEP_API_KEY": "<YOUR_TOKEN>",
        "KARAKEEP_CUSTOM_HEADERS": "{\"CF-Access-Client-Id\": \"...\", \"CF-Access-Client-Secret\": \"...\"}"
      }
    }
  }
}
```

From Docker:

```json
{
  "mcpServers": {
    "karakeep": {
      "command": "docker",
      "args": [
        "run",
        "-e",
        "KARAKEEP_API_ADDR=https://<YOUR_SERVER_ADDR>",
        "-e",
        "KARAKEEP_API_KEY=<YOUR_TOKEN>",
        "-e",
        "KARAKEEP_CUSTOM_HEADERS={\"CF-Access-Client-Id\": \"...\", \"CF-Access-Client-Secret\": \"...\"}",
        "ghcr.io/karakeep-app/karakeep-mcp:latest"
      ]
    }
  }
}
```

# Sitescoop

A small local service and CLI that fetches a web page, extracts readable text, and returns a trimmed result. This is designed to help agent workflows pull context on demand without requiring the content to be pasted into the prompt or stored in the workspace.

## Why this exists

- Keeps agent prompts smaller by fetching content on demand.
- Avoids storing external page content in the workspace.
- Provides a simple, local endpoint that other tools can call.

## Install

Requirements:

- Node.js 18+ (Windows, Linux, macOS)

Quick start (global CLI + service):

```bash
npm install -g .
fetchservice
```

Quick start (project-local):

```bash
npm install
npm run fetch:service
```

Full install:

```bash
npm install
```

For a global CLI install:

```bash
npm install -g .
```

## Run the service

```bash
npm run fetch:service
```

The service listens on port 8787 by default. Override with the `FETCH_SERVICE_PORT` environment variable.

## Use the service

Request:

```bash
curl "http://localhost:8787/fetch?url=https://example.com"
```

Response:

```json
{
  "url": "https://example.com",
  "text": "..."
}
```

## CLI usage

```bash
npm run fetch:page -- https://example.com
```

Or, if installed globally:

```bash
fetchpage https://example.com
```

## Behavior

- Extracts main content using Readability with a DOM fallback.
- Trims output to 15,000 characters by default.
- Uses a fallback text extraction proxy if direct access fails.
- Enforces response size limits and request timeouts.
- Blocks localhost/private IP targets by default.

## Query parameters

All options are optional and use safe defaults.

- `maxChars` (number): Maximum characters returned (default 15000)
- `maxBytes` (number): Maximum bytes read from the response (default 2000000)
- `timeoutMs` (number): Request timeout in milliseconds (default 15000)
- `allowFallbacks` (boolean): Enable proxy fallbacks (default true)
- `preferReadability` (boolean): Use Readability extraction first (default true)
- `userAgentMode` (string): `fixed` or `url` (default `url`)
- `userAgentFamily` (string): `desktop`, `mobile`, or `tablet` (default `desktop`)
- `redirectLimit` (number): Max redirects to follow (default 3)
- `includeMeta` (boolean): Include `meta` in response (default false)
- `chunkSize` (number): Return `chunks` when set
- `chunkOverlap` (number): Overlap for chunks (default 200)
- `maxChunks` (number): Max chunks returned (default 10)

Example:

```bash
curl "http://localhost:8787/fetch?url=https://example.com&includeMeta=true&chunkSize=1200&chunkOverlap=200"
```

## Skill manifest

See [skill.json](skill.json) for a lightweight description of inputs, outputs, and the HTTP endpoint this service exposes.

## Notes

Respect website terms and access rules. This tool does not bypass access controls, paywalls, or bot protections.
If a site requires human verification, the service will return an error instead of attempting to bypass it.

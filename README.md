# VA Chat Service API

This is the headless API backend for the VA-IA Chat Service. It is built with Next.js but functions purely as an API provider, handling communication with OpenAI's API, Vector Stores, and Tools.

## Features

- **OpenAI Integration:** Handles chat completions and tool calls.
- **Vector Store Support:** Manages file search and context retrieval.
- **Headless Architecture:** UI components have been removed; this service provides JSON APIs.
- **Tools:** Supports file search and custom function calling.

## Prerequisites

- Node.js (v18 or later)
- OpenAI API Key

## Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/samukan/va-chat-service.git
    cd va-chat-service
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Configure environment variables:
    Create a `.env` file in the root directory:
    ```dotenv
    OPENAI_API_KEY=sk-proj-...
    PORT=3004
    ```

## Development

To run the service in development mode:

```bash
npm run dev
```

The API will be available at `http://localhost:3004`.

## Website Sync (Authenticated Dry Run)

Use this when your website is behind Google OAuth and plain HTTP fetch returns only an app shell.

Standalone website-sync scripts automatically load environment variables from `.env` via `dotenv`.

### Environment variables

Create or update `.env` in `va-chat-service`:

```dotenv
WEBSITE_BASE_URL=http://localhost:3000
WEBSITE_CRAWL_URLS=/,/instructions,/ai-chat,/contact,/profile/hakemukset?tab=budget
WEBSITE_STORAGE_STATE_PATH=./storageState.json
WEBSITE_EXTRACT_SELECTOR=main
WEBSITE_RENDER_TIMEOUT_MS=20000
WEBSITE_LOADING_TEXT_PATTERNS=Ladataan,Loading,Kirjaudu
WEBSITE_LOGIN_START_PATH=/
HEADFUL=1
WEBSITE_CHUNK_TARGET_CHARS=1200
WEBSITE_CHUNK_MAX_CHARS=1600
WEBSITE_CHUNK_OVERLAP_CHARS=80
WEBSITE_DRY_RUN_SHOW_CHUNKS=0
DEBUG=0
WEBSITE_SYNC_MANIFEST_PATH=./website-sync-manifest.json
WEBSITE_SYNC_LIMIT_PAGES=0
WEBSITE_SYNC_DRY_RUN=0
WEBSITE_SYNC_INCLUDE_PRIVATE=0
```

### Record authenticated storage state (manual login)

PowerShell:

```powershell
cd C:\Users\samuk\Documents\VA\va-chat-service
npm run website:auth:record
```

Then complete Google login in the opened browser window. The script saves `storageState.json` to `WEBSITE_STORAGE_STATE_PATH`.

### Run dry-run extraction

PowerShell:

```powershell
cd C:\Users\samuk\Documents\VA\va-chat-service
npm run website:sync:dry
```

Output includes, per allowlisted page:

- canonical URL
- title
- text length
- content hash (short prefix)
- chunk count
- preview (first 200 chars)
- status (`OK`, `FAILED_AUTH_OR_LOGIN`, `FAILED_LOADING`, `ERROR`)

For `/profile/*` pages, preview is hidden by default and output includes `privacy: user`.

Set `WEBSITE_DRY_RUN_SHOW_CHUNKS=1` to print metadata of the first 2 chunks per page.

### Run upload sync

This uploads non-private allowlisted website chunks to the existing vector store from `RAG_VECTOR_STORE_ID` (or first value of `RAG_VECTOR_STORE_IDS`).
`OPENAI_API_KEY` must be set in `.env` for upload mode.

PowerShell:

```powershell
cd C:\Users\samuk\Documents\VA\va-chat-service
npm run website:sync
```

Manifest behavior:

- Manifest file default: `website-sync-manifest.json`
- Keyed by canonical URL
- Stores `last_seen`, `content_hash`, `chunk_count`, `uploaded_at`, `uploaded_chunk_ids`
- If `content_hash` is unchanged, page upload is skipped on later runs

Reset manifest:

```powershell
Remove-Item .\website-sync-manifest.json -ErrorAction SilentlyContinue
```

Privacy rule:

- `/profile/*` pages are marked `privacy=user`
- They are skipped by default in upload mode
- To include them explicitly, set `WEBSITE_SYNC_INCLUDE_PRIVATE=1`

Optional upload dry-run (no OpenAI calls):

```powershell
$env:WEBSITE_SYNC_DRY_RUN="1"
npm run website:sync
```

Optional env debug (presence only, values masked):

```powershell
$env:DEBUG_ENV="1"
npm run website:sync
```

If auth is missing/expired, statuses show `FAILED_AUTH_OR_LOGIN` and you should re-run:

```powershell
npm run website:auth:record
```

### Tests

Unit tests are deterministic and do not require Playwright login:

```powershell
cd C:\Users\samuk\Documents\VA\va-chat-service
npm run test:website-sync
```

## Production Build & Deployment

1.  Build the project:

    ```bash
    npm run build
    ```

2.  Start with PM2:

    ```bash
    pm2 start npm --name "va-chat-service" -- start
    ```

3.  Save PM2 process list:
    ```bash
    pm2 save
    ```

## API Endpoints

The service exposes endpoints under `/api`, primarily:

- `POST /api/turn_response`: Handles a chat turn, processing user input and returning AI responses (including tool outputs).

## Architecture

This service is designed to sit behind an Auth Server or Reverse Proxy.

- **Port:** 3004
- **Public Access:** Should be restricted. The `va-backend` (Auth Server) proxies requests to this service after authenticating the user.

## License

This project is based on the [OpenAI Responses Starter App](https://github.com/openai/openai-responses-starter-app) and is licensed under the MIT License. See the LICENSE file for details.

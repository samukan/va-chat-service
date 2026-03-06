# VA Chat Service (Phase 1, Clean-Room)

This service is a new clean-room implementation for Go Exchange AI chat platform Phase 1.

## Scope (Phase 1)

- Fastify + Node 20+ + TypeScript ESM runtime
- `POST /v1/chat` with SSE token streaming
- `GET /health`
- `GET /metrics`
- Service-to-service HMAC guard for `/v1/*`
- Structured JSON logging with correlation id
- Feature flags (stubbed for later phases)
  - `RAG_ENABLED=0` (default)
  - `INJECT_CONTEXT_ENABLED=0` (default)

## Not in Phase 1

- Milvus/RAG retrieval implementation
- Ingest/sync logic implementation
- Crawl/scheduler implementation

`/v1/search`, `/v1/ingest`, and `DELETE /v1/docs/:doc_id` exist as `501 Not Implemented` stubs.

---

## Environment variables

Create `.env` in `va-chat-service` root:

```dotenv
NODE_ENV=development
HOST=0.0.0.0
PORT=3004
LOG_LEVEL=info
APP_VERSION=phase1

OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=
OPENAI_CHAT_MODEL=gpt-4.1-mini

S2S_HMAC_SECRET=replace-with-long-random-secret
S2S_MAX_SKEW_SEC=60
NONCE_TTL_SEC=300

HTTP_MAX_BODY_BYTES=262144

RAG_ENABLED=0
INJECT_CONTEXT_ENABLED=0

# Optional: protect /metrics with header x-metrics-token
METRICS_AUTH_TOKEN=
```

---

## Run locally

Install dependencies:

```bash
npm install
```

Development:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Start built app:

```bash
npm run start
```

Run Phase 1 smoke tests:

```bash
npm run test:phase1
```

---

## API contracts (Phase 1)

### `POST /v1/chat`

Request body:

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "options": {
    "temperature": 0.2,
    "max_output_tokens": 512
  }
}
```

Required headers:

- `x-s2s-timestamp` (unix seconds)
- `x-s2s-nonce`
- `x-s2s-signature` (hex or base64)
- `x-user-context` (base64 JSON)
- `x-correlation-id`

User context payload (decoded from `x-user-context`):

```json
{
  "user_id": "u123",
  "tenant_id": "t456",
  "roles": ["student"]
}
```

SSE response headers:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

SSE event format:

1. `event: token`
   `data: {"t":"..."}`
2. `event: done`
   `data: {"ok":true}`
3. `event: error`
   `data: {"message":"...","code":"..."}`

### `GET /health`

Returns service status, OpenAI dependency status, version, uptime.

### `GET /metrics`

Returns request totals and latency histogram (JSON).

### Stubbed endpoints (`501`)

- `POST /v1/search`
- `POST /v1/ingest`
- `DELETE /v1/docs/:doc_id`

---

## Signed request example (PowerShell)

```powershell
$secret = "replace-with-long-random-secret"
$path = "/v1/chat"
$method = "POST"
$timestamp = [int][double]::Parse((Get-Date -UFormat %s))
$nonce = [guid]::NewGuid().ToString("N")
$bodyObj = @{
  messages = @(@{ role = "user"; content = "Hei" })
}
$bodyJson = $bodyObj | ConvertTo-Json -Depth 10 -Compress

$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$bodyHashBytes = $sha256.ComputeHash($bodyBytes)
$bodyHash = -join ($bodyHashBytes | ForEach-Object { $_.ToString("x2") })

$baseString = "$method`n$path`n$timestamp`n$nonce`n$bodyHash"
$hmac = New-Object System.Security.Cryptography.HMACSHA256 ([System.Text.Encoding]::UTF8.GetBytes($secret))
$signatureBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($baseString))
$signatureHex = -join ($signatureBytes | ForEach-Object { $_.ToString("x2") })

$userContext = @{ user_id = "u1"; tenant_id = "tenant-a"; roles = @("student") } | ConvertTo-Json -Compress
$userContextB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($userContext))

Invoke-WebRequest -Method Post -Uri "http://localhost:3004$path" -Headers @{
  "Content-Type" = "application/json"
  "x-s2s-timestamp" = "$timestamp"
  "x-s2s-nonce" = $nonce
  "x-s2s-signature" = $signatureHex
  "x-user-context" = $userContextB64
  "x-correlation-id" = [guid]::NewGuid().ToString()
} -Body $bodyJson
```

---

## go-exchange-server integration note (gateway)

Gateway must sign forwarded requests exactly from raw body bytes.

Pseudocode:

```text
bodyHash = sha256(rawBodyBytes)
baseString = method + "\n" + path + "\n" + timestamp + "\n" + nonce + "\n" + bodyHash
signature = HMAC_SHA256(S2S_HMAC_SECRET, baseString)

headers:
  x-s2s-timestamp = timestamp
  x-s2s-nonce = nonce
  x-s2s-signature = signature (hex/base64)
  x-user-context = base64(json({ user_id, tenant_id, roles }))
  x-correlation-id = request correlation id

forward request to va-chat-service /v1/chat
```

Validation behavior in va-chat-service:

- Missing S2S headers: `401`
- Invalid signature/timestamp/nonce/user-context: `403`

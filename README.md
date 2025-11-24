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

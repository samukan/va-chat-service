#!/usr/bin/env node

import net from 'node:net';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

const MIN_SPAN_MS = Number(process.env.STREAM_TEST_MIN_SPAN_MS || 150);
const START_TIMEOUT_MS = Number(process.env.STREAM_V2_START_TIMEOUT_MS || 60000);
const VERBOSE = process.env.STREAM_TEST_VERBOSE === '1';
const DEFAULT_PORT = Number(process.env.STREAM_V2_DEFAULT_PORT || 3004);

function log(message, details = {}) {
  if (!VERBOSE) {
    return;
  }

  console.log(`[stream-v2] ${message}`);
  if (Object.keys(details).length > 0) {
    console.log(JSON.stringify(details, null, 2));
  }
}

function fail(message, details = {}) {
  console.error(`❌ STREAM V2 TEST FAILED: ${message}`);
  if (Object.keys(details).length > 0) {
    console.error(JSON.stringify(details, null, 2));
  }
  process.exit(1);
}

function ok(message, details = {}) {
  console.log(`✅ ${message}`);
  if (Object.keys(details).length > 0) {
    console.log(JSON.stringify(details, null, 2));
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate free port')));
        return;
      }

      const {port} = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

function startNextDev(port) {
  const nextBin = require.resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
    },
    stdio: VERBOSE ? 'inherit' : 'pipe',
  });

  if (!VERBOSE) {
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
  }

  return child;
}

async function waitForServerReady(port) {
  const start = Date.now();
  const url = `http://127.0.0.1:${port}/api/turn_response_v2`;

  while (Date.now() - start < START_TIMEOUT_MS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          messages: [{role: 'user', content: 'ping'}],
        }),
      });

      if (response.status !== 404) {
        return;
      }
    } catch {
      // keep polling
    }

    await sleep(300);
  }

  throw new Error(`Next dev server did not become ready within ${START_TIMEOUT_MS}ms`);
}

async function hasReadyV2Endpoint(port) {
  const url = `http://127.0.0.1:${port}/api/turn_response_v2`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        messages: [{role: 'user', content: 'ping'}],
      }),
      signal: AbortSignal.timeout(3000),
    });

    return response.status !== 404;
  } catch {
    return false;
  }
}

async function verifyStream(port) {
  const url = `http://127.0.0.1:${port}/api/turn_response_v2`;
  const startedAt = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      messages: [{role: 'user', content: 'test'}],
      conversationId: 'conv-test',
    }),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    fail('Expected text/event-stream content type', {
      status: response.status,
      contentType,
    });
  }

  if (!response.ok) {
    const body = await response.text();
    fail('Non-2xx response status', {
      status: response.status,
      contentType,
      body: body.slice(0, 500),
    });
  }

  if (!response.body) {
    fail('Response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deltaTimestamps = [];

  while (true) {
    const {done, value} = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, {stream: true});
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith('data:')) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      const eventType = parsed.event || parsed.type;
      if (eventType === 'response.output_text.delta') {
        deltaTimestamps.push(Date.now());
      }
    }
  }

  if (deltaTimestamps.length < 2) {
    fail('Expected at least 2 delta events', {
      deltaCount: deltaTimestamps.length,
      elapsedMs: Date.now() - startedAt,
    });
  }

  const spanMs = deltaTimestamps[deltaTimestamps.length - 1] - deltaTimestamps[0];
  if (spanMs < MIN_SPAN_MS) {
    fail('Delta events are buffered', {
      deltaCount: deltaTimestamps.length,
      spanMs,
      thresholdMs: MIN_SPAN_MS,
      elapsedMs: Date.now() - startedAt,
    });
  }

  ok('V2 streaming verified', {
    deltaCount: deltaTimestamps.length,
    spanMs,
    thresholdMs: MIN_SPAN_MS,
    elapsedMs: Date.now() - startedAt,
  });
}

async function shutdown(child) {
  if (!child || child.killed) {
    return;
  }

  child.kill('SIGTERM');

  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(4000).then(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }),
  ]);
}

async function main() {
  let child;
  let port = DEFAULT_PORT;

  if (await hasReadyV2Endpoint(DEFAULT_PORT)) {
    log('Using existing va-chat-service instance', {port: DEFAULT_PORT});
    await verifyStream(DEFAULT_PORT);
    return;
  }

  port = await getFreePort();
  log('Starting Next dev for v2 verifier', {port});

  child = startNextDev(port);

  const terminate = async () => {
    await shutdown(child);
    process.exit(1);
  };

  process.on('SIGINT', terminate);
  process.on('SIGTERM', terminate);

  try {
    await waitForServerReady(port);
    await verifyStream(port);
  } finally {
    await shutdown(child);
  }
}

main().catch((error) => {
  fail('Unhandled verifier error', {
    message: error instanceof Error ? error.message : String(error),
  });
});

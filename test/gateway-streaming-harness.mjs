#!/usr/bin/env node

import net from 'node:net';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {setTimeout as sleep} from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

const MIN_SPAN_MS = Number(process.env.GATEWAY_STREAM_TEST_MIN_SPAN_MS || 150);
const START_TIMEOUT_MS = Number(process.env.GATEWAY_STREAM_TEST_START_TIMEOUT_MS || 60000);
const VERBOSE = process.env.GATEWAY_STREAM_TEST_VERBOSE === '1';

function log(message, details = {}) {
  if (!VERBOSE) {
    return;
  }

  console.log(`[gateway-stream] ${message}`);
  if (Object.keys(details).length > 0) {
    console.log(JSON.stringify(details, null, 2));
  }
}

function fail(message, details = {}) {
  console.error(`❌ GATEWAY STREAM TEST FAILED: ${message}`);
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

  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      RAG_GATEWAY_MOCK: '1',
      NODE_ENV: 'production',
    },
    stdio: VERBOSE ? 'inherit' : 'pipe',
  });

  if (!VERBOSE) {
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
  }

  return child;
}

function runNextBuild() {
  const nextBin = require.resolve('next/dist/bin/next');

  const child = spawn(process.execPath, [nextBin, 'build'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    stdio: VERBOSE ? 'inherit' : 'pipe',
  });

  if (!VERBOSE) {
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
  }

  return child;
}

async function ensureBuild() {
  const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
  if (fs.existsSync(buildIdPath)) {
    return;
  }

  log('No .next build found, running next build');
  await new Promise((resolve, reject) => {
    const buildProcess = runNextBuild();
    buildProcess.on('error', reject);
    buildProcess.on('exit', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`next build exited with code ${code}`));
    });
  });
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
          messages: [{role: 'user', content: 'ready-check'}],
        }),
      });

      if (response.status !== 404) {
        return;
      }
    } catch {
      // retry
    }

    await sleep(250);
  }

  throw new Error(`Service did not become ready within ${START_TIMEOUT_MS}ms`);
}

async function verifyStreaming(port) {
  const url = `http://127.0.0.1:${port}/api/turn_response_v2`;
  const startedAt = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      messages: [{role: 'user', content: 'ping'}],
    }),
  });

  const contentType = response.headers.get('content-type') || '';
  log('Response headers', {
    status: response.status,
    contentType,
  });

  if (!contentType.toLowerCase().includes('text/event-stream')) {
    fail('Expected text/event-stream content type', {
      status: response.status,
      contentType,
    });
  }

  if (!response.ok) {
    const bodyText = await response.text();
    fail('Non-2xx response status', {
      status: response.status,
      contentType,
      body: bodyText.slice(0, 500),
    });
  }

  if (!response.body) {
    fail('Response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deltaTimestamps = [];
  let doneEventSeen = false;
  let parsedEvents = 0;

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

      parsedEvents += 1;
      const eventType = parsed.event || parsed.type;
      log('Parsed event', {eventType});

      if (eventType === 'response.output_text.delta') {
        deltaTimestamps.push(Date.now());
      }

      if (eventType === 'response.output_text.done') {
        doneEventSeen = true;
      }
    }
  }

  if (deltaTimestamps.length < 2) {
    fail('Expected at least 2 delta events', {
      parsedEvents,
      deltaCount: deltaTimestamps.length,
      elapsedMs: Date.now() - startedAt,
    });
  }

  const spanMs = deltaTimestamps[deltaTimestamps.length - 1] - deltaTimestamps[0];
  if (spanMs < MIN_SPAN_MS) {
    fail('Delta events appear buffered (arrived essentially at once)', {
      deltaCount: deltaTimestamps.length,
      spanMs,
      thresholdMs: MIN_SPAN_MS,
      elapsedMs: Date.now() - startedAt,
    });
  }

  if (!doneEventSeen) {
    fail('Did not receive response.output_text.done event', {
      parsedEvents,
      deltaCount: deltaTimestamps.length,
    });
  }

  ok('Streaming verified: incremental SSE deltas detected', {
    deltaCount: deltaTimestamps.length,
    spanMs,
    thresholdMs: MIN_SPAN_MS,
    doneEventSeen,
    elapsedMs: Date.now() - startedAt,
  });
}

async function killProcessTree(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
      killer.on('exit', () => resolve(undefined));
      killer.on('error', () => resolve(undefined));
    });
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
  const port = await getFreePort();
  log('Starting gateway stream harness', {port});

  await ensureBuild();

  const child = startNextDev(port);

  const terminate = async () => {
    await killProcessTree(child);
    process.exit(1);
  };

  process.on('SIGINT', terminate);
  process.on('SIGTERM', terminate);

  try {
    await waitForServerReady(port);
    await verifyStreaming(port);
  } finally {
    await killProcessTree(child);
  }
}

main().catch((error) => {
  fail('Unhandled harness error', {
    message: error instanceof Error ? error.message : String(error),
  });
});

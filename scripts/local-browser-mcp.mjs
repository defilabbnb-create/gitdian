#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const HOME_DIR = process.env.HOME ?? process.cwd();
const STATE_DIR = path.join(HOME_DIR, '.openclaw-autoclaw');
const ARTIFACT_DIR = path.join(STATE_DIR, 'artifacts');
const SESSION_POOL_PATH = path.join(STATE_DIR, 'session_pool.json');
const LOG_PATH = path.join(STATE_DIR, 'local-browser-mcp.log');
const SERVER_INFO = {
  name: 'autoglm-browser-agent-local-wrapper',
  version: '0.1.0',
};
const TOOL_DEFS = [
  {
    name: 'browser_subagent',
    description:
      'Open a URL with Playwright, capture a screenshot, and summarize console/network issues for browser debugging tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Original user task text.',
        },
        start_url: {
          type: 'string',
          description: 'Preferred starting URL.',
        },
        session_id: {
          type: 'string',
          description: 'Existing session identifier to reuse the last known URL.',
        },
        auto_approve: {
          type: 'boolean',
          description: 'Accepted for compatibility and ignored by the local wrapper.',
        },
        feishu_message_id: {
          type: 'string',
          description: 'Accepted for compatibility and ignored by the local wrapper.',
        },
        feishu_chat_id: {
          type: 'string',
          description: 'Accepted for compatibility and ignored by the local wrapper.',
        },
      },
      required: ['task'],
      additionalProperties: true,
    },
  },
  {
    name: 'close_browser',
    description:
      'Clear the local browser wrapper session pool and cached state artifacts.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

class McpStreamServer {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.started = false;
    this.useNdjson = false;
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    process.stdin.on('data', (chunk) => {
      void appendLog(`stdin chunk bytes=${chunk.length}`);
      void appendLog(`stdin raw=${JSON.stringify(chunk.toString('utf8'))}`);
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain().catch((error) => {
        this.writeError(null, -32603, formatError(error));
      });
    });
    process.stdin.on('end', () => process.exit(0));
    process.stdin.resume();
  }

  async drain() {
    while (true) {
      const lineEnd = this.buffer.indexOf('\n');
      if (
        lineEnd !== -1 &&
        this.buffer.length > 0 &&
        this.buffer[0] === 123
      ) {
        const rawLine = this.buffer.slice(0, lineEnd).toString('utf8').trim();
        this.buffer = this.buffer.slice(lineEnd + 1);
        if (!rawLine) {
          continue;
        }

        this.useNdjson = true;
        void appendLog(`ndjson=${rawLine}`);

        let request;
        try {
          request = JSON.parse(rawLine);
        } catch (error) {
          this.writeError(null, -32700, `Invalid JSON: ${formatError(error)}`);
          continue;
        }

        await this.handleRequest(request);
        continue;
      }

      const headerEnd = findHeaderEnd(this.buffer);
      if (headerEnd === -1) {
        return;
      }

      const separatorLength = getSeparatorLength(this.buffer, headerEnd);
      const rawHeader = this.buffer.slice(0, headerEnd).toString('utf8');
      const contentLength = parseContentLength(rawHeader);
      void appendLog(`header=${JSON.stringify(rawHeader)} contentLength=${contentLength}`);
      if (contentLength === null) {
        this.buffer = Buffer.alloc(0);
        this.writeError(null, -32700, 'Missing Content-Length header');
        return;
      }

      const messageStart = headerEnd + separatorLength;
      const messageEnd = messageStart + contentLength;
      if (this.buffer.length < messageEnd) {
        return;
      }

      const rawBody = this.buffer.slice(messageStart, messageEnd).toString('utf8');
      void appendLog(`body=${rawBody}`);
      this.buffer = this.buffer.slice(messageEnd);

      let request;
      try {
        request = JSON.parse(rawBody);
      } catch (error) {
        this.writeError(null, -32700, `Invalid JSON: ${formatError(error)}`);
        continue;
      }

      await this.handleRequest(request);
    }
  }

  async handleRequest(request) {
    const { id = null, method, params = {} } = request;
    void appendLog(`request method=${method ?? '(missing)'} id=${id}`);

    if (!method) {
      this.writeError(id, -32600, 'Request missing method');
      return;
    }

    if (method === 'initialize') {
      this.writeResult(id, {
        protocolVersion: params.protocolVersion ?? '2025-11-25',
        capabilities: {
          tools: {},
        },
        serverInfo: SERVER_INFO,
      });
      return;
    }

    if (method === 'notifications/initialized') {
      return;
    }

    if (method === 'ping') {
      this.writeResult(id, {});
      return;
    }

    if (method === 'tools/list') {
      this.writeResult(id, { tools: TOOL_DEFS });
      return;
    }

    if (method === 'tools/call') {
      const name = params.name;
      const args = params.arguments ?? {};

      if (name === 'browser_subagent') {
        try {
          const result = await handleBrowserSubagent(args);
          this.writeResult(id, {
            content: [
              {
                type: 'text',
                text: result.text,
              },
            ],
            structuredContent: result.structuredContent,
          });
        } catch (error) {
          this.writeResult(id, {
            content: [
              {
                type: 'text',
                text: `browser_subagent failed: ${formatError(error)}`,
              },
            ],
            isError: true,
          });
        }
        return;
      }

      if (name === 'close_browser') {
        const result = await handleCloseBrowser();
        this.writeResult(id, {
          content: [
            {
              type: 'text',
              text: result.message,
            },
          ],
          structuredContent: result,
        });
        return;
      }

      this.writeError(id, -32601, `Unknown tool: ${name}`);
      return;
    }

    this.writeError(id, -32601, `Unknown method: ${method}`);
  }

  writeResult(id, result) {
    this.writeMessage({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  writeError(id, code, message) {
    this.writeMessage({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
      },
    });
  }

  writeMessage(payload) {
    const raw = Buffer.from(JSON.stringify(payload), 'utf8');
    void appendLog(`response=${raw.toString('utf8')}`);
    if (this.useNdjson) {
      process.stdout.write(`${raw.toString('utf8')}\n`);
      return;
    }

    process.stdout.write(`Content-Length: ${raw.length}\r\n\r\n`);
    process.stdout.write(raw);
  }
}

function findHeaderEnd(buffer) {
  const crlf = buffer.indexOf('\r\n\r\n');
  if (crlf !== -1) {
    return crlf;
  }

  return buffer.indexOf('\n\n');
}

function getSeparatorLength(buffer, headerEnd) {
  if (
    buffer[headerEnd] === 13 &&
    buffer[headerEnd + 1] === 10 &&
    buffer[headerEnd + 2] === 13 &&
    buffer[headerEnd + 3] === 10
  ) {
    return 4;
  }

  return 2;
}

function parseContentLength(headerText) {
  const lines = headerText.split(/\r?\n/);
  for (const line of lines) {
    const [name, value] = line.split(':');
    if (!name || !value) {
      continue;
    }

    if (name.toLowerCase() === 'content-length') {
      const parsed = Number.parseInt(value.trim(), 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

async function ensureStateDir() {
  await fsp.mkdir(STATE_DIR, { recursive: true });
  await fsp.mkdir(ARTIFACT_DIR, { recursive: true });
}

async function appendLog(message) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(
      LOG_PATH,
      `[${new Date().toISOString()}] ${message}\n`,
      'utf8',
    );
  } catch {
    // Ignore logging failures to keep the MCP server responsive.
  }
}

async function readSessionPool() {
  try {
    const raw = await fsp.readFile(SESSION_POOL_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { busy: null, sessions: {} };
    }
    return {
      busy: parsed.busy ?? null,
      sessions: parsed.sessions ?? {},
    };
  } catch {
    return { busy: null, sessions: {} };
  }
}

async function writeSessionPool(pool) {
  await ensureStateDir();
  await fsp.writeFile(
    SESSION_POOL_PATH,
    JSON.stringify(
      {
        busy: pool.busy ?? null,
        sessions: pool.sessions ?? {},
      },
      null,
      2,
    ),
    'utf8',
  );
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function truncateText(text, maxLength = 1200) {
  if (!text) {
    return '';
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function inferUrlFromTask(task) {
  if (!task) {
    return null;
  }

  const match = task.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

function toAbsoluteUrl(input) {
  try {
    return new URL(input).toString();
  } catch {
    return null;
  }
}

async function launchBrowser() {
  try {
    return await chromium.launch({
      channel: 'chrome',
      headless: true,
    });
  } catch {
    return chromium.launch({
      headless: true,
    });
  }
}

async function handleBrowserSubagent(args) {
  const task = typeof args.task === 'string' ? args.task.trim() : '';
  if (!task) {
    throw new Error('task is required');
  }

  await ensureStateDir();
  const pool = await readSessionPool();
  const now = new Date().toISOString();
  const existingSession =
    typeof args.session_id === 'string' ? pool.sessions[args.session_id] : null;
  const targetUrl =
    toAbsoluteUrl(args.start_url) ??
    toAbsoluteUrl(existingSession?.lastUrl) ??
    toAbsoluteUrl(existingSession?.start_url) ??
    toAbsoluteUrl(inferUrlFromTask(task)) ??
    'https://local3000.luckytad.vip/';
  const sessionId =
    typeof args.session_id === 'string' && args.session_id
      ? args.session_id
      : randomUUID();

  pool.busy = {
    session_id: sessionId,
    task,
    started_at: now,
  };
  await writeSessionPool(pool);

  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];

  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: {
        width: 1456,
        height: 819,
      },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    page.on('console', (message) => {
      if (consoleMessages.length >= 12) {
        return;
      }

      consoleMessages.push({
        type: message.type(),
        text: truncateText(message.text(), 300),
      });
    });
    page.on('pageerror', (error) => {
      if (pageErrors.length >= 6) {
        return;
      }

      pageErrors.push(truncateText(formatError(error), 300));
    });
    page.on('response', (response) => {
      if (failedRequests.length >= 12) {
        return;
      }

      const status = response.status();
      if (status >= 400) {
        failedRequests.push({
          status,
          url: truncateText(response.url(), 240),
        });
      }
    });

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForLoadState('networkidle', {
      timeout: 10_000,
    }).catch(() => {});

    const title = await page.title().catch(() => '');
    const finalUrl = page.url();
    const headingTexts = await page
      .locator('h1, h2, h3')
      .evaluateAll((elements) =>
        elements
          .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
          .filter(Boolean)
          .slice(0, 10),
      )
      .catch(() => []);
    const mainText = await page
      .locator('main')
      .innerText()
      .catch(async () => page.locator('body').innerText().catch(() => ''));

    const screenshotPath = path.join(
      ARTIFACT_DIR,
      `browser-subagent-${Date.now()}.png`,
    );
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    pool.sessions[sessionId] = {
      session_id: sessionId,
      start_url: targetUrl,
      lastUrl: finalUrl,
      updated_at: new Date().toISOString(),
      screenshotPath,
      title,
    };
    pool.busy = null;
    await writeSessionPool(pool);

    const summaryLines = [
      `task: ${task}`,
      `status: success`,
      `session_id: ${sessionId}`,
      `final_url: ${finalUrl}`,
      `title: ${title || '(empty)'}`,
      `headings: ${
        Array.isArray(headingTexts) && headingTexts.length > 0
          ? headingTexts.join(' | ')
          : '(none)'
      }`,
      `console_messages: ${
        consoleMessages.length > 0
          ? consoleMessages.map((item) => `${item.type}: ${item.text}`).join(' || ')
          : '(none)'
      }`,
      `page_errors: ${pageErrors.length > 0 ? pageErrors.join(' || ') : '(none)'}`,
      `failed_requests: ${
        failedRequests.length > 0
          ? failedRequests.map((item) => `${item.status} ${item.url}`).join(' || ')
          : '(none)'
      }`,
      `main_text_excerpt: ${truncateText(mainText, 900) || '(empty)'}`,
      '[screenshots]',
      screenshotPath,
    ];

    return {
      text: summaryLines.join('\n'),
      structuredContent: {
        task,
        status: 'success',
        session_id: sessionId,
        final_url: finalUrl,
        title,
        headings: headingTexts,
        console_messages: consoleMessages,
        page_errors: pageErrors,
        failed_requests: failedRequests,
        main_text_excerpt: truncateText(mainText, 900),
        screenshots: [screenshotPath],
      },
    };
  } catch (error) {
    pool.busy = null;
    await writeSessionPool(pool);
    throw error;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function handleCloseBrowser() {
  await ensureStateDir();
  await writeSessionPool({
    busy: null,
    sessions: {},
  });

  return {
    ok: true,
    message: 'Local browser wrapper state cleared.',
  };
}

void appendLog('server boot');
new McpStreamServer().start();

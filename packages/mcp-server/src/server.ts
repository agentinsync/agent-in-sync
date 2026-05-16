import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { toolDefinitions } from './tools.js';
import { toolHandlers, type ToolContext } from './handlers.js';
import { requireApiKey, type AuthenticatedRequest } from './middleware/auth.js';

function createMcpServer(
  userId: string,
  organizationId: string,
  apiKeyId: string,
  agentId?: string
): Server {
  const server = new Server(
    {
      name: 'agent-in-sync-qa',
      version: '0.0.1',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions,
  }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;

    try {
      const typedArgs = (args ?? {}) as Record<string, unknown>;
      const ctx: ToolContext = { userId, organizationId, apiKeyId, agentId };

      const handler = toolHandlers[name];
      if (!handler) {
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ error: `Unknown tool: ${name}` }) },
          ],
          isError: true,
        };
      }

      return await handler(typedArgs, ctx);
    } catch (err) {
      const errorMessage =
        err instanceof z.ZodError
          ? err.flatten()
          : err instanceof Error
            ? err.message
            : 'Unknown error';

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });

  return server;
}

async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const { userId, organizationId, agentId } = authReq;

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = createMcpServer(userId, organizationId, authReq.apiKeyId, agentId);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: req => (req as AuthenticatedRequest).userId || ipKeyGenerator(req.ip ?? ''),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later',
  },
});

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(
    cors({
      origin: (process.env.TRUSTED_ORIGINS ?? 'http://localhost:5173')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean),
      credentials: true,
    })
  );

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'mcp-server' });
  });

  app.post('/mcp', requireApiKey, mcpLimiter, handleMcpRequest);

  return app;
}

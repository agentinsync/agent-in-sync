import { initializeWeaviateSchema } from '@agent-in-sync/backend/weaviate';
import { createApp } from './server.js';

const port = process.env.MCP_PORT ?? 3001;

async function main(): Promise<void> {
  await initializeWeaviateSchema();

  const app = createApp();

  app.listen(port, () => {
    console.log(`MCP Server running on http://localhost:${port}`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
    console.log('Configure your MCP client with:');
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            'agent-in-sync': {
              url: `http://localhost:${port}/mcp`,
              type: 'http',
              headers: {
                'X-API-Key': 'ask_YOUR_API_KEY',
              },
            },
          },
        },
        null,
        2
      )
    );
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});

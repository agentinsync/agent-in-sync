import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const handlers = [
  http.get('/api/keys', () => HttpResponse.json([])),
  http.get('/api/issues', () => HttpResponse.json({ data: [], total: 0 })),
  http.get('/api/dashboard/stats', () =>
    HttpResponse.json({ issues: 0, solutions: 0, apiKeys: 0 })
  ),
  http.get('/api/search/facets', () =>
    HttpResponse.json({ projects: [], techStack: [], tags: [] })
  ),
];

export { handlers };
export const server = setupServer(...handlers);

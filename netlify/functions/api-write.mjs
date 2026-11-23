// Write path: Notion writes that patch the snapshot blob, plus sync-now.
import { writeRoutes } from '../../hub-core/routes-write.js';
import { handle } from '../../hub-core/netlify-adapter.js';

export default req => handle(writeRoutes, req);

export const config = {
  path: ['/api/actions', '/api/actions/*', '/api/rfis', '/api/variations', '/api/items/*', '/api/records/*', '/api/sync-now', '/api/team/*', '/api/item-bic/*', '/api/duplicates/merge', '/api/duplicates/dismiss',
    '/api/programme/*', '/api/todo/*', '/api/meetings', '/api/suppliers', '/api/item-status/plan', '/api/item-status/apply'],
  method: ['GET', 'POST', 'PATCH'],
};

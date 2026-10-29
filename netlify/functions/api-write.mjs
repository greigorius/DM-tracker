// Write path: Notion writes that patch the snapshot blob, plus sync-now.
import { writeRoutes } from '../../hub-core/routes-write.js';
import { handle } from '../../hub-core/netlify-adapter.js';

export default req => handle(writeRoutes, req);

export const config = {
  path: ['/api/actions', '/api/rfis', '/api/variations', '/api/items/*', '/api/sync-now'],
  method: ['POST', 'PATCH'],
};

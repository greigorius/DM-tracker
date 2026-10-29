// Fast read path: snapshot blobs + bootstrap. No Notion SDK in this bundle.
import { readRoutes } from '../../hub-core/routes-read.js';
import { handle } from '../../hub-core/netlify-adapter.js';

export default req => handle(readRoutes, req, { cache: true });

export const config = {
  path: ['/api/snapshot', '/api/bootstrap'],
  method: ['GET'],
};

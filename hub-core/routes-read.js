// Read routes: snapshot + bootstrap. Imports no Notion SDK code.
import { getSnapshots, getBootstrap, getDismissedDuplicates } from './read.js';

export const readRoutes = [
  ['GET', /^\/api\/snapshot\/?$/, async ({ query }) => {
    const dbs = (query.get('dbs') || '').split(',').map(s => s.trim()).filter(Boolean);
    return getSnapshots(dbs);
  }],
  ['GET', /^\/api\/bootstrap\/?$/, async () => getBootstrap()],
  ['GET', /^\/api\/duplicates\/dismissed\/?$/, async () => getDismissedDuplicates()],
];

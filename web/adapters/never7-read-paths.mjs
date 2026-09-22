import {routes} from './never7-progress.mjs';

// Optional, owner-local replay evidence. It never becomes part of a game save.
export function validateReadPaths(data, engine) {
  if (data?.format !== 'vnkit.read-paths' || data.version !== 1 ||
      data.gameId !== engine.content.id || data.gameSignature !== engine.signature ||
      !data.paths || typeof data.paths !== 'object' || Array.isArray(data.paths)) {
    throw Error('Incompatible Never7 completed-route read paths');
  }
  const paths = {};
  for (const [route, record] of Object.entries(data.paths)) {
    if (!routes.some(r => r.id === route) || !Array.isArray(record?.ids) ||
        !record.ids.length || record.ids.length > 100000 || !record.ids.every(id => {
          if (typeof id !== 'string') return false;
          const match = /^([A-Za-z0-9_]+):([0-9a-f]{8})$/.exec(id);
          return match && Object.hasOwn(engine.content.runtime.scripts, match[1]) &&
            parseInt(match[2], 16) % 4 === 0;
        })) throw Error('Invalid Never7 completed-route read path');
    paths[route] = new Set(record.ids);
  }
  return paths;
}

export function inheritedRead(engine, id) {
  return engine.routeProgress().some(route => route.complete && engine.readPaths?.[route.id]?.has(id));
}

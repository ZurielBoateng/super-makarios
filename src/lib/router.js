// Minimal hash router: enough for a small app (library / reader / admin)
// without pulling in a routing library. Routes are matched in order;
// the first pattern that matches the current hash wins.

const routes = [];
let notFoundHandler = () => {};

export function route(pattern, handler) {
  // pattern like '/', '/read/:id', '/admin'
  const paramNames = [];
  const regex = new RegExp(
    '^' +
      pattern
        .split('/')
        .map((seg) => {
          if (seg.startsWith(':')) {
            paramNames.push(seg.slice(1));
            return '([^/]+)';
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/') +
      '$'
  );
  routes.push({ regex, paramNames, handler });
}

export function notFound(handler) {
  notFoundHandler = handler;
}

function currentPath() {
  const hash = window.location.hash.slice(1);
  return hash ? hash.split('?')[0] : '/';
}

function currentQuery() {
  const hash = window.location.hash.slice(1);
  const qIndex = hash.indexOf('?');
  return new URLSearchParams(qIndex >= 0 ? hash.slice(qIndex + 1) : '');
}

async function resolve() {
  const path = currentPath();
  const query = currentQuery();
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(m[i + 1]);
      });
      await r.handler({ params, query, path });
      return;
    }
  }
  await notFoundHandler({ path, query });
}

export function navigate(path) {
  if (window.location.hash.slice(1) === path) {
    resolve();
  } else {
    window.location.hash = path;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  resolve();
}

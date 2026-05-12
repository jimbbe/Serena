/**
 * T8 — HTTP Router.
 *
 * Map-based route table mapping `{method, path}` to handler functions.
 * Supports path params via `:name` segments.
 * Zero npm dependencies.
 */

export type RouteMatch<T> = {
  handler: T;
  params: Record<string, string>;
} | {
  handler: null;
  allowedMethods: string[];
  params: Record<string, string>;
};

type RouteEntry<T> = {
  segments: string[];
  handler: T;
  method: string;
};

export class Router<T> {
  private routes: RouteEntry<T>[] = [];

  /**
   * Register a handler for a specific method + path.
   * Path may contain `:param` segments for dynamic params.
   */
  register(method: string, path: string, handler: T): void {
    const segments = path.split("/").filter(Boolean);
    this.routes.push({ segments, handler, method: method.toUpperCase() });
  }

  /**
   * Match a method + url string against registered routes.
   * Returns the handler and extracted params, or null if no match.
   * If path matches but method doesn't, returns allowedMethods for 405.
   */
  match(method: string, url: string): RouteMatch<T> | null {
    const upperMethod = method.toUpperCase();
    const urlSegments = url.split("/").filter(Boolean);

    // Collect routes that match this path
    const pathMatches: RouteEntry<T>[] = [];
    let matchedParams: Record<string, string> | null = null;

    for (const route of this.routes) {
      const params = matchSegments(urlSegments, route.segments);
      if (params !== null) {
        pathMatches.push(route);
        if (route.method === upperMethod) {
          matchedParams = params;
          // Prefer first method-matching route
          if (matchedParams !== null) break;
        }
      }
    }

    if (pathMatches.length === 0) return null;

    // Exact method match found
    if (matchedParams !== null) {
      const handler = pathMatches.find((r) => r.method === upperMethod)!;
      return { handler: handler.handler, params: matchedParams };
    }

    // Path matches but method doesn't → collect allowed methods
    const allowedMethods: string[] = [];
    for (const route of pathMatches) {
      if (!allowedMethods.includes(route.method)) {
        allowedMethods.push(route.method);
      }
    }

    return { handler: null, allowedMethods, params: {} };
  }
}

/**
 * Match URL segments against route segments.
 * Returns extracted params if they match, null otherwise.
 */
function matchSegments(
  urlSegments: string[],
  routeSegments: string[],
): Record<string, string> | null {
  if (urlSegments.length !== routeSegments.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < routeSegments.length; i++) {
    const routeSeg = routeSegments[i]!;
    const urlSeg = urlSegments[i]!;

    if (routeSeg.startsWith(":")) {
      // Dynamic param
      const paramName = routeSeg.slice(1);
      params[paramName] = urlSeg;
    } else if (routeSeg !== urlSeg) {
      // Static segment mismatch
      return null;
    }
  }

  return params;
}

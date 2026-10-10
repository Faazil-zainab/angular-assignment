import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Routes } from '@angular/router';

import { APP_ROUTES } from './app.routes';

/**
 * Guards the application's real route table.
 *
 * `app.spec.ts` renders the root component with `provideRouter([])`, so it never
 * validates `APP_ROUTES` - which is exactly how a pathless layout route with no
 * `path` shipped and broke the whole SPA at startup (`NG04014`). These tests use
 * the real table, so the same mistake fails here instead of in the browser.
 */
describe('APP_ROUTES', () => {
  it('is a configuration the Router accepts', () => {
    TestBed.configureTestingModule({ providers: [provideRouter(APP_ROUTES)] });

    // The Router validates the configuration while it is constructed, so a bad
    // table throws NG04014 on injection rather than on the first navigation.
    expect(() => TestBed.inject(Router)).not.toThrow();
  });

  it('gives every route a path or a matcher', () => {
    const check = (routes: Routes, path = '(root)'): void => {
      for (const route of routes) {
        expect(route.path ?? route.matcher)
          .withContext(`route at ${path} has neither "path" nor "matcher"`)
          .toBeDefined();
        if (route.children) {
          check(route.children, `${path}/${route.path ?? '<matcher>'}`);
        }
      }
    };

    check(APP_ROUTES);
  });

  it('protects the authenticated area behind the auth guard', () => {
    const shell = APP_ROUTES.find((route) => route.canActivate !== undefined);

    expect(shell).withContext('no guarded shell route found').toBeDefined();
    expect(shell?.children?.map((child) => child.path)).toEqual(['dashboard', 'admin']);
  });

  it('routes unknown URLs to the not-found page', () => {
    expect(APP_ROUTES.at(-1)?.path).toBe('**');
  });
});

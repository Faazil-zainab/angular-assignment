import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { API_BASE_URL } from '../tokens/api.tokens';
import { authInterceptor } from './auth.interceptor';
import { httpErrorInterceptor } from './http-error.interceptor';

const BASE_URL = 'http://localhost:3000/api';

interface AuthSpy {
  token: jasmine.Spy<() => string | null>;
  handleUnauthorized: jasmine.Spy<() => void>;
}

function configure(token: string | null): AuthSpy {
  const spy: AuthSpy = {
    token: jasmine.createSpy('token').and.returnValue(token),
    handleUnauthorized: jasmine.createSpy('handleUnauthorized'),
  };

  TestBed.configureTestingModule({
    providers: [
      // Mirrors app.config.ts: authInterceptor outermost, so it sees the error
      // httpErrorInterceptor has already normalised.
      provideHttpClient(withInterceptors([authInterceptor, httpErrorInterceptor])),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: API_BASE_URL, useValue: BASE_URL },
      { provide: AuthService, useValue: spy },
    ],
  });

  return spy;
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  afterEach(() => httpMock.verify());

  it('attaches the bearer token to API requests', () => {
    configure('jwt-abc');
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);

    http.get(`${BASE_URL}/records`).subscribe();

    const request = httpMock.expectOne(`${BASE_URL}/records`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer jwt-abc');
    request.flush({ success: true, data: [], meta: { requestId: 't', timestamp: '' } });
  });

  it('does not attach the token to the login request', () => {
    configure('jwt-stale');
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);

    http.post(`${BASE_URL}/auth/login`, {}).subscribe();

    const request = httpMock.expectOne(`${BASE_URL}/auth/login`);
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush({ success: true, data: {}, meta: { requestId: 't', timestamp: '' } });
  });

  it('omits the header when signed out', () => {
    configure(null);
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);

    http.get(`${BASE_URL}/records`).subscribe();

    const request = httpMock.expectOne(`${BASE_URL}/records`);
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush({ success: true, data: [], meta: { requestId: 't', timestamp: '' } });
  });

  it('clears the session when the API rejects the token as expired', () => {
    const auth = configure('jwt-expired');
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);

    let caught: unknown;
    http.get(`${BASE_URL}/records`).subscribe({ error: (error: unknown) => (caught = error) });

    httpMock.expectOne(`${BASE_URL}/records`).flush(
      { success: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(auth.handleUnauthorized).toHaveBeenCalled();
    expect(caught).toBeDefined();
  });

  it('does not sign the user out for a plain invalid-credentials failure', () => {
    const auth = configure('jwt-abc');
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);

    http.post(`${BASE_URL}/auth/login`, {}).subscribe({ error: () => undefined });

    httpMock.expectOne(`${BASE_URL}/auth/login`).flush(
      { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'bad login' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(auth.handleUnauthorized).not.toHaveBeenCalled();
  });
});

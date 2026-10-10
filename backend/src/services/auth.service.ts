import { UserStatus, toPublicUser, type LoginRequest, type LoginResult } from '../models';
import { ApiError } from '../utils/api-error';
import { logger } from '../utils/logger';
import { hashPassword, verifyPassword } from '../utils/password';
import { tokenService, type TokenService } from './token.service';
import { userService, type UserService } from './user.service';

const log = logger.child('auth');

/** Cached digest used to equalise timing when the login id is unknown. */
let placeholderDigest: Promise<string> | undefined;

function unknownUserDigest(): Promise<string> {
  placeholderDigest ??= hashPassword('mploychek-placeholder-digest');
  return placeholderDigest;
}

/**
 * Authentication rules. Kept out of the controller so the same logic can be
 * reused by the seed script, the tests and any future refresh-token flow.
 *
 * Status codes are chosen deliberately:
 * - **401** when the credentials are wrong *or* the user is unknown. The message
 *   is identical in both cases so the endpoint cannot be used to enumerate users.
 * - **403** when the credentials are valid but the account may not sign in as the
 *   requested role (or is not active) - the caller is the problem, not the token.
 */
export class AuthService {
  constructor(
    private readonly users: UserService = userService,
    private readonly tokens: TokenService = tokenService,
  ) {}

  /** Validates credentials and issues an access token. */
  async login(credentials: LoginRequest): Promise<LoginResult> {
    const user = await this.users.findByUserId(credentials.userId);

    // Hash a comparison even for an unknown user id, so response time does not
    // reveal whether the account exists.
    const candidateDigest = user?.passwordHash ?? (await unknownUserDigest());
    const passwordMatches = await verifyPassword(credentials.password, candidateDigest);

    if (user === undefined || !passwordMatches) {
      log.warn('failed login attempt', {
        userId: credentials.userId,
        requestedRole: credentials.role,
        reason: user === undefined ? 'UNKNOWN_USER_ID' : 'PASSWORD_MISMATCH',
      });
      throw ApiError.unauthorized('Invalid user ID or password.', {
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      log.warn('rejected login for an inactive account', { userId: user.userId });
      throw ApiError.forbidden('This account is not active. Please contact an administrator.', {
        code: 'ACCOUNT_INACTIVE',
      });
    }

    if (user.role !== credentials.role) {
      log.warn('role mismatch on login', {
        userId: user.userId,
        actualRole: user.role,
        requestedRole: credentials.role,
      });
      throw ApiError.forbidden(
        `This account is registered as ${user.role} and cannot sign in as ${credentials.role}.`,
        {
          code: 'ROLE_MISMATCH',
          details: { registeredRole: user.role, requestedRole: credentials.role },
        },
      );
    }

    const issued = this.tokens.sign(user);
    log.info('login succeeded', { userId: user.userId, role: user.role });

    // `toPublicUser` is the only path out of this layer - the password digest is
    // structurally absent from the returned object.
    return { ...issued, user: toPublicUser(user) };
  }
}

/** Shared instance used by the auth controller. */
export const authService = new AuthService();

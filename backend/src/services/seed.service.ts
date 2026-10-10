import { config } from '../config/env.config';
import {
  Department,
  RecordStatus,
  RiskLevel,
  UserRole,
  UserStatus,
  VerificationType,
  type SeedRecord,
  type SeedUser,
} from '../models';
import {
  recordRepository,
  userRepository,
  type RecordRepository,
  type UserRepository,
} from '../repositories';
import { logger } from '../utils/logger';
import { userService, type UserService } from './user.service';

const log = logger.child('seed');

/** Fixed base timestamp so generated user data is reproducible between runs. */
const SEED_EPOCH = '2026-10-01T10:00:00.000Z';

/**
 * Development users.
 *
 * `id` is allocated by the repository (`USR-001`, `USR-002`, ...), so a fresh store
 * produces exactly the documented sample. The login id is the stable natural key
 * that re-seeding matches on.
 *
 * These are fixtures, not secrets: passwords are bcrypt hashed before they reach the
 * store and are listed in `backend/README.md` so a reviewer can sign in.
 */
export const DEMO_USERS: readonly SeedUser[] = [
  {
    userId: 'admin001',
    name: 'System Administrator',
    email: 'admin@mploychek.local',
    password: 'Admin@123',
    role: UserRole.ADMIN,
    department: Department.ADMINISTRATION,
    status: UserStatus.ACTIVE,
    createdAt: SEED_EPOCH,
  },
  {
    userId: 'user001',
    name: 'General User',
    email: 'user@mploychek.local',
    password: 'User@123',
    role: UserRole.GENERAL_USER,
    department: Department.VERIFICATION,
    status: UserStatus.ACTIVE,
    createdAt: SEED_EPOCH,
  },
];

/**
 * Development background verification records.
 *
 * A deliberately broad spread so every feature is demonstrable from the seeded
 * data alone:
 *
 * - **date** - 2026-09-05 .. 2026-09-24
 * - **type** - all five verification types
 * - **status** - `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`
 * - **risk** - `LOW`, `MEDIUM`, `HIGH`
 * - **assignment** - `USR-002` (the general user) owns ten; `USR-001` (the
 *   administrator) owns six
 *
 * Ids are explicit so re-seeding updates the same rows instead of appending
 * duplicates. `assignedUserId` holds the user's `id` (`USR-002`), which is what
 * role based access control compares against.
 */
export const DEMO_RECORDS: readonly SeedRecord[] = [
  {
    id: 'REC-001',
    candidateName: 'Arun Kumar',
    verificationType: VerificationType.EMPLOYMENT,
    status: RecordStatus.COMPLETED,
    submittedDate: '2026-09-15T10:30:00.000Z',
    completedDate: '2026-09-17T15:30:00.000Z',
    riskLevel: RiskLevel.LOW,
    assignedUserId: 'USR-002',
    company: 'Tech Solutions Pvt Ltd',
    location: 'Chennai',
    description: 'Employment verification completed successfully.',
  },
  {
    id: 'REC-002',
    candidateName: 'Priya Sharma',
    verificationType: VerificationType.EDUCATION,
    status: RecordStatus.COMPLETED,
    submittedDate: '2026-09-16T09:00:00.000Z',
    completedDate: '2026-09-19T11:15:00.000Z',
    riskLevel: RiskLevel.MEDIUM,
    assignedUserId: 'USR-002',
    company: 'Delhi University',
    location: 'New Delhi',
    description: 'Degree and marksheets confirmed with the registrar.',
  },
  {
    id: 'REC-003',
    candidateName: 'Rohan Mehta',
    verificationType: VerificationType.IDENTITY,
    status: RecordStatus.IN_PROGRESS,
    submittedDate: '2026-09-20T08:45:00.000Z',
    riskLevel: RiskLevel.HIGH,
    assignedUserId: 'USR-002',
    company: 'Infosys Ltd',
    location: 'Bengaluru',
    description: 'Aadhaar and PAN pending the final database match.',
  },
  {
    id: 'REC-004',
    candidateName: 'Ananya Reddy',
    verificationType: VerificationType.ADDRESS,
    status: RecordStatus.PENDING,
    submittedDate: '2026-09-22T14:20:00.000Z',
    riskLevel: RiskLevel.LOW,
    assignedUserId: 'USR-002',
    company: 'Wipro Ltd',
    location: 'Hyderabad',
    description: 'Field visit scheduled for the coming week.',
  },
  {
    id: 'REC-005',
    candidateName: 'Vikram Singh',
    verificationType: VerificationType.CRIMINAL,
    status: RecordStatus.FAILED,
    submittedDate: '2026-09-10T07:30:00.000Z',
    completedDate: '2026-09-14T16:10:00.000Z',
    riskLevel: RiskLevel.HIGH,
    assignedUserId: 'USR-002',
    company: 'Tata Consultancy Services',
    location: 'Mumbai',
    description: 'Court record could not be retrieved; escalated for manual review.',
  },
  {
    id: 'REC-006',
    candidateName: 'Sneha Iyer',
    verificationType: VerificationType.EMPLOYMENT,
    status: RecordStatus.IN_PROGRESS,
    submittedDate: '2026-09-21T10:05:00.000Z',
    riskLevel: RiskLevel.MEDIUM,
    assignedUserId: 'USR-002',
    company: 'Cognizant Technology Solutions',
    location: 'Pune',
    description: 'HR confirmation awaited for the two previous employers.',
  },
  {
    id: 'REC-007',
    candidateName: 'Karthik Nair',
    verificationType: VerificationType.EDUCATION,
    status: RecordStatus.COMPLETED,
    submittedDate: '2026-09-12T12:00:00.000Z',
    completedDate: '2026-09-15T09:40:00.000Z',
    riskLevel: RiskLevel.LOW,
    assignedUserId: 'USR-002',
    company: 'Anna University',
    location: 'Chennai',
    description: 'Degree verified against the university records; no discrepancies found.',
  },
  {
    id: 'REC-008',
    candidateName: 'Divya Menon',
    verificationType: VerificationType.IDENTITY,
    status: RecordStatus.COMPLETED,
    submittedDate: '2026-09-11T15:30:00.000Z',
    completedDate: '2026-09-13T10:20:00.000Z',
    riskLevel: RiskLevel.MEDIUM,
    assignedUserId: 'USR-002',
    company: 'HCL Technologies',
    location: 'Noida',
    description: 'Identity verified with a minor name-spelling variance noted.',
  },
  {
    id: 'REC-009',
    candidateName: 'Imran Qureshi',
    verificationType: VerificationType.EMPLOYMENT,
    status: RecordStatus.PENDING,
    submittedDate: '2026-09-23T09:10:00.000Z',
    riskLevel: RiskLevel.LOW,
    assignedUserId: 'USR-002',
    company: 'Accenture Solutions',
    location: 'Gurugram',
    description: 'Request received; verification has not started.',
  },
  {
    id: 'REC-010',
    candidateName: 'Meera Joshi',
    verificationType: VerificationType.CRIMINAL,
    status: RecordStatus.IN_PROGRESS,
    submittedDate: '2026-09-19T13:25:00.000Z',
    riskLevel: RiskLevel.HIGH,
    assignedUserId: 'USR-002',
    company: 'Capgemini India',
    location: 'Pune',
    description: 'Police record check in progress across two jurisdictions.',
  },
  {
    id: 'REC-011',
    candidateName: 'Sanjay Gupta',
    verificationType: VerificationType.EMPLOYMENT,
    status: RecordStatus.COMPLETED,
    submittedDate: '2026-09-05T10:00:00.000Z',
    completedDate: '2026-09-08T14:45:00.000Z',
    riskLevel: RiskLevel.LOW,
    assignedUserId: 'USR-001',
    company: 'Tech Mahindra',
    location: 'Noida',
    description: 'Employment history confirmed for the last five years.',
  },
  {
    id: 'REC-012',
    candidateName: 'Lakshmi Narayanan',
    verificationType: VerificationType.EDUCATION,
    status: RecordStatus.FAILED,
    submittedDate: '2026-09-06T11:15:00.000Z',
    completedDate: '2026-09-09T16:00:00.000Z',
    riskLevel: RiskLevel.MEDIUM,
    assignedUserId: 'USR-001',
    company: 'IIT Madras',
    location: 'Chennai',
    description: 'University could not confirm the claimed graduation year.',
  },
  {
    id: 'REC-013',
    candidateName: 'Rahul Verma',
    verificationType: VerificationType.IDENTITY,
    status: RecordStatus.IN_PROGRESS,
    submittedDate: '2026-09-18T08:30:00.000Z',
    riskLevel: RiskLevel.HIGH,
    assignedUserId: 'USR-001',
    company: 'Mindtree Ltd',
    location: 'Bengaluru',
    description: 'Document verification underway; the database check is pending.',
  },
  {
    id: 'REC-014',
    candidateName: 'Neha Kapoor',
    verificationType: VerificationType.ADDRESS,
    status: RecordStatus.COMPLETED,
    submittedDate: '2026-09-07T09:45:00.000Z',
    completedDate: '2026-09-11T12:30:00.000Z',
    riskLevel: RiskLevel.LOW,
    assignedUserId: 'USR-001',
    company: 'Zoho Corporation',
    location: 'Chennai',
    description: 'Address confirmed via a successful field visit.',
  },
  {
    id: 'REC-015',
    candidateName: 'Arjun Malhotra',
    verificationType: VerificationType.EMPLOYMENT,
    status: RecordStatus.COMPLETED,
    submittedDate: '2026-09-08T14:00:00.000Z',
    completedDate: '2026-09-12T10:05:00.000Z',
    riskLevel: RiskLevel.MEDIUM,
    assignedUserId: 'USR-001',
    company: 'Flipkart Internet',
    location: 'Bengaluru',
    description: 'Two minor date discrepancies noted in the employment history.',
  },
  {
    id: 'REC-016',
    candidateName: 'Kavya Suresh',
    verificationType: VerificationType.CRIMINAL,
    status: RecordStatus.PENDING,
    submittedDate: '2026-09-24T10:40:00.000Z',
    riskLevel: RiskLevel.LOW,
    assignedUserId: 'USR-001',
    company: 'Freshworks',
    location: 'Chennai',
    description: 'Criminal record verification is queued.',
  },
];

export interface SeedOutcome {
  users: { created: string[]; reset: string[]; skipped: string[] };
  records: { created: string[]; updated: string[]; skipped: string[] };
}

/**
 * Creates or resets the development data set.
 *
 * Writes go through the service and repository layers, never through `fs`: users via
 * `UserService` (which owns hashing and uniqueness) and records via
 * `RecordRepository`, because the record service is deliberately read-only.
 */
export class SeedService {
  constructor(
    private readonly users: UserService = userService,
    private readonly records: RecordRepository = recordRepository,
    private readonly usersRepository: UserRepository = userRepository,
  ) {}

  /**
   * Boot-time seeding: creates only what is missing.
   *
   * Nothing existing is replaced - which is what guarantees that restarting the
   * backend never erases users or records.
   */
  async ensureDevelopmentData(): Promise<SeedOutcome | undefined> {
    if (!config.auth.seedUsers) {
      log.debug('development data seeding is disabled', { seedUsers: config.auth.seedUsers });
      return undefined;
    }

    const users = { created: [] as string[], reset: [] as string[], skipped: [] as string[] };

    for (const seed of DEMO_USERS) {
      const existing = await this.users.findByUserId(seed.userId);

      if (existing !== undefined) {
        users.skipped.push(existing.userId);
        continue;
      }

      const created = await this.users.create({
        userId: seed.userId,
        name: seed.name,
        email: seed.email,
        password: seed.password,
        role: seed.role,
        department: seed.department,
        status: seed.status,
        createdAt: seed.createdAt,
      });
      users.created.push(created.userId);
    }

    const records = await this.records.upsertMany(DEMO_RECORDS.map((record) => ({ ...record })), {
      overwrite: false,
    });

    if (users.created.length > 0 || records.created.length > 0) {
      log.info('development data seeded', { users: users.created, records: records.created });
    }

    return { users, records };
  }

  /**
   * `npm run seed`: recreates the development data set.
   *
   * The seeded accounts get their password and profile restored and the demo records
   * are overwritten. Anything else in the store is left untouched.
   */
  async resetDevelopmentData(): Promise<SeedOutcome> {
    const users = { created: [] as string[], reset: [] as string[], skipped: [] as string[] };

    for (const seed of DEMO_USERS) {
      const existing = await this.users.findByUserId(seed.userId);

      if (existing === undefined) {
        const created = await this.users.create({
          userId: seed.userId,
          name: seed.name,
          email: seed.email,
          password: seed.password,
          role: seed.role,
          department: seed.department,
          status: seed.status,
          createdAt: seed.createdAt,
        });
        users.created.push(created.userId);
        continue;
      }

      await this.users.update(existing.id, {
        name: seed.name,
        email: seed.email,
        role: seed.role,
        department: seed.department,
        password: seed.password,
      });

      if (existing.status !== seed.status) {
        // The administrator fixture acts on behalf of the platform here; the
        // self-service guard is meant for API callers, not the seeder.
        const actor = (await this.users.findByUserId(DEMO_USERS[0]?.userId ?? '')) ?? existing;
        await this.users.updateStatus(existing.id, seed.status, actor);
      }

      users.reset.push(existing.userId);
    }

    const records = await this.records.upsertMany(DEMO_RECORDS.map((record) => ({ ...record })), {
      overwrite: true,
    });

    log.info('development data reset', {
      usersCreated: users.created,
      usersReset: users.reset,
      recordsCreated: records.created,
      recordsUpdated: records.updated,
      usersFile: this.usersRepository.location,
      recordsFile: this.records.location,
    });

    return { users, records };
  }
}

/** Shared instance used by the server bootstrap and the seed script. */
export const seedService = new SeedService();

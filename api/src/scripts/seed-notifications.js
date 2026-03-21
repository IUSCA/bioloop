/* eslint-disable no-console, no-restricted-syntax, no-await-in-loop, no-plusplus, no-continue, max-len */
/**
 * seed-notifications.js
 *
 * Creates a representative set of test notifications for manual UI testing.
 * Covers all notification types, filter states (read/unread/archived/bookmarked),
 * metadata features (links, role_overrides, role_addons), and one-off events.
 *
 * USAGE
 *   node src/scripts/seed-notifications.js [OPTIONS]
 *
 * OPTIONS
 *   --user <username>   Username to receive direct notifications (default: e2eUser)
 *   --force, -f         Delete and recreate existing seeded notifications instead
 *                       of skipping them
 *   --dry-run           Print what would be created/skipped without touching the DB
 *   --oneoff-only       Only create one-off notifications; skip stable ones
 *   --stable-only       Only create stable notifications; skip one-offs
 *   --no-text-prefix    Do not prepend "(test notification #id)" to body text
 *   --help, -h          Show this help text and exit
 *
 * IDEMPOTENCY
 *   Stable notifications carry a _seed_key inside their metadata.  On each run the
 *   script checks whether a notification with that _seed_key already exists for the
 *   target user:
 *     - default:     skip it and log [skip]
 *     - --force:     delete the existing record (cascades to all recipients) and
 *                    recreate it from scratch, then log [recreate]
 *
 *   One-off notifications have no _seed_key and are always created as new records.
 *   They model transient real-world events (e.g. "Your download is ready") that
 *   a user expects to accumulate over time.  They are logged as [oneoff].
 *
 * EXAMPLES
 *   node src/scripts/seed-notifications.js
 *   node src/scripts/seed-notifications.js --user e2eUser --force
 *   node src/scripts/seed-notifications.js --dry-run
 *   node src/scripts/seed-notifications.js --oneoff-only
 *   node src/scripts/seed-notifications.js --stable-only --user ccbrandt
 *
 * EXPECTED UI BEHAVIOUR (for e2eUser / user role)
 *
 *   Filter            Expected visible notifications
 *   ─────────────── ─────────────────────────────────────────────────────
 *   Default (none)  7 unread non-archived items
 *   Unread          info.welcome, warning.quota, error.workflow,
 *                   success.upload, info.docs, workflow.nightly, info.new_user
 *   Read            dataset.approved, system.token
 *   Bookmarked      info.docs (unread), dataset.approved (read)
 *   Archived        system.maintenance
 *   Search "quota"  warning.quota
 *   Search "pipeline"  error.workflow, workflow.nightly
 *   Search "dataset"   warning.quota, success.upload, dataset.approved
 *
 *   Role-override / role-addon behaviour:
 *     - admin-role recipients see admin-specific override/addon payloads
 *     - user-role recipients see base payloads
 */

require('module-alias/register');
const path = require('path');
const fs = require('fs');

global.__basedir = path.join(__dirname, '..', '..');

require('dotenv-safe').config({ example: '.env.default' });

const prisma = require('@/db');

// ── CLI argument parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  // Re-print the block comment at the top of this file as help text.
  const src = fs.readFileSync(__filename, 'utf8');
  const match = src.match(/\/\*\*([\s\S]*?)\*\//);
  if (match) console.log(match[0]);
  process.exit(0);
}

const FORCE = args.includes('--force') || args.includes('-f');
const DRY_RUN = args.includes('--dry-run');
const ONEOFF_ONLY = args.includes('--oneoff-only');
const STABLE_ONLY = args.includes('--stable-only');
const NO_TEXT_PREFIX = args.includes('--no-text-prefix');

let TARGET_USERNAME = 'e2eUser';
const userIdx = args.indexOf('--user');
if (userIdx !== -1 && args[userIdx + 1]) {
  TARGET_USERNAME = args[userIdx + 1];
}

// ── Notification definitions ──────────────────────────────────────────────────
//
// Each "stable" definition has a unique seed_key stored in metadata._seed_key.
// One-off definitions have no seed_key.
//
// Fields:
//   seed_key   — string, unique per stable notification; absent for one-offs
//   data       — passed directly to prisma.notification.create({ data })
//                minus the `recipients` field (added at runtime)
//   targeting  — { type: 'direct' } | { type: 'role', roleName: '...' }
//   state      — optional: initial recipient state for the target user
//                { is_read, is_archived, is_bookmarked }

const STABLE_DEFINITIONS = [

  // ── Unread, label only, no text, no links ──────────────────────────────────
  {
    seed_key: 'info.welcome',
    data: {
      type: 'info',
      label: 'Welcome back to Bioloop',
      metadata: { _seed_key: 'info.welcome' },
    },
    targeting: { type: 'direct' },
  },

  // ── Unread, text ───────────────────────────────────────────────────────────
  {
    seed_key: 'warning.quota',
    data: {
      type: 'warning',
      label: 'Storage quota warning',
      text: 'You are using 80% of your allocated storage. Consider archiving old datasets to free up space.',
      metadata: { _seed_key: 'warning.quota' },
    },
    targeting: { type: 'direct' },
  },

  // ── Unread, error, text ────────────────────────────────────────────────────
  {
    seed_key: 'error.workflow',
    data: {
      type: 'error',
      label: 'Workflow failed',
      text: 'The pipeline for dataset genomics_batch_7 encountered an error during the inspect stage. Please review and retry.',
      metadata: { _seed_key: 'error.workflow' },
    },
    targeting: { type: 'direct' },
  },

  // ── Unread, success, 1 trusted internal link ───────────────────────────────
  {
    seed_key: 'success.upload',
    data: {
      type: 'success',
      label: 'Dataset upload complete',
      text: 'raw_data_2025_q1 has been processed and is ready for analysis.',
      metadata: {
        _seed_key: 'success.upload',
        links: [
          {
            id: 'view-dataset',
            label: 'View dataset',
            href: '/datasets/1',
            trusted: true,
            open_in_new_tab: false,
          },
        ],
      },
    },
    targeting: { type: 'direct' },
  },

  // ── Unread + bookmarked; 1 trusted internal + 1 untrusted external link ────
  {
    seed_key: 'info.docs',
    data: {
      type: 'info',
      label: 'New documentation available',
      text: 'Updated guides for dataset registration and download workflows are now available.',
      metadata: {
        _seed_key: 'info.docs',
        links: [
          {
            id: 'docs-registration',
            label: 'Registration guide',
            href: '/docs',
            trusted: true,
            open_in_new_tab: false,
          },
          {
            id: 'external-guide',
            label: 'External reference',
            href: 'https://example.com/guide',
            trusted: false,
            requires_confirmation: true,
            open_in_new_tab: true,
          },
        ],
      },
    },
    targeting: { type: 'direct' },
    state: { is_bookmarked: true, bookmarked_at: new Date() },
  },

  // ── Archived; role broadcast to all admins ─────────────────────────────────
  {
    seed_key: 'system.maintenance',
    data: {
      type: 'system',
      label: 'Scheduled maintenance window',
      text: 'Bioloop will be unavailable from 2:00 AM to 4:00 AM on Sunday for infrastructure upgrades.',
      metadata: { _seed_key: 'system.maintenance' },
    },
    targeting: { type: 'role', roleName: 'admin' },
    state: { is_archived: true, archived_at: new Date() },
  },

  // ── Read + bookmarked; 2 trusted internal links ────────────────────────────
  {
    seed_key: 'dataset.approved',
    data: {
      type: 'dataset',
      label: 'Dataset created',
      text: 'genomics_dataset_001 was registered.',
      metadata: {
        _seed_key: 'dataset.approved',
        links: [
          {
            id: 'view-ds',
            label: 'View dataset',
            href: '/datasets/2',
            trusted: true,
            open_in_new_tab: false,
          },
          {
            id: 'download',
            label: 'Download',
            href: '/datasets/2/download',
            trusted: true,
            open_in_new_tab: false,
          },
        ],
      },
    },
    targeting: { type: 'direct' },
    state: {
      is_read: true, read_at: new Date(), is_bookmarked: true, bookmarked_at: new Date(),
    },
  },

  // ── Read, label only ───────────────────────────────────────────────────────
  {
    seed_key: 'system.token',
    data: {
      type: 'system',
      label: 'API token refreshed successfully',
      metadata: { _seed_key: 'system.token' },
    },
    targeting: { type: 'direct' },
    state: { is_read: true, read_at: new Date() },
  },

  // ── Unread; role broadcast; role_overrides for admin ──────────────────────
  //    Admin sees: overridden label, richer text, + admin dashboard link.
  //    Non-admin users in the role see the base label/text and no link.
  {
    seed_key: 'workflow.nightly',
    data: {
      type: 'workflow',
      label: 'Nightly pipeline completed',
      text: 'The automated nightly ingestion pipeline ran successfully.',
      metadata: {
        _seed_key: 'workflow.nightly',
        role_overrides: {
          admin: {
            label: 'Nightly pipeline completed (admin view)',
            text: 'All 12 datasets were ingested. 0 errors. Admin dashboard updated.',
            links: [
              {
                id: 'admin-dash',
                label: 'Admin dashboard',
                href: '/admin',
                trusted: true,
                open_in_new_tab: false,
              },
            ],
          },
        },
      },
    },
    targeting: { type: 'role', roleName: 'admin' },
  },

  // ── Unread; role_addons for admin ──────────────────────────────────────────
  //    Admin sees: label suffix " [action required]", extra text sentence,
  //    + /users link.  Non-admin sees the base content only.
  {
    seed_key: 'info.new_user',
    data: {
      type: 'info',
      label: 'New user registered',
      text: 'A new user account has been created and is pending role assignment.',
      metadata: {
        _seed_key: 'info.new_user',
        role_addons: {
          admin: {
            label_suffix: ' [action required]',
            text_suffix: ' Visit the admin panel to assign roles.',
            links: [
              {
                id: 'manage-users',
                label: 'Manage users',
                href: '/users',
                trusted: true,
                open_in_new_tab: false,
              },
            ],
          },
        },
      },
    },
    targeting: { type: 'direct' },
  },

  // ── Unread; typed DATASET_CREATED notification (direct) ───────────────────
  {
    seed_key: 'dataset.created.direct.1',
    data: {
      type: 'DATASET_CREATED',
      label: 'RAW_DATA 1 was created',
      text: 'Dataset 1 is now available.',
      metadata: {
        _seed_key: 'dataset.created.direct.1',
        dataset_id: 1,
        dataset_type: 'RAW_DATA',
      },
    },
    targeting: { type: 'direct' },
  },

  // ── Unread; typed DATASET_CREATED notification (direct) ───────────────────
  {
    seed_key: 'dataset.created.direct.2',
    data: {
      type: 'DATASET_CREATED',
      label: 'DATA_PRODUCT 2 was created',
      text: 'Dataset 2 is now available.',
      metadata: {
        _seed_key: 'dataset.created.direct.2',
        dataset_id: 2,
        dataset_type: 'DATA_PRODUCT',
      },
    },
    targeting: { type: 'direct' },
  },

  // ── Unread; typed DATASET_CREATED notification (role broadcast) ───────────
  {
    seed_key: 'dataset.created.role.admin',
    data: {
      type: 'DATASET_CREATED',
      label: 'RAW_DATA 3 was created',
      text: 'Dataset 3 is now available.',
      metadata: {
        _seed_key: 'dataset.created.role.admin',
        dataset_id: 3,
        dataset_type: 'RAW_DATA',
      },
    },
    targeting: { type: 'role', roleName: 'admin' },
  },

  // ── Unread; role broadcast combo: admin + user ────────────────────────────
  {
    seed_key: 'role.combo.admin_user',
    data: {
      type: 'info',
      label: 'Test role-combo broadcast: admin + user',
      text: 'Seed test notification targeted to users in admin or user roles.',
      metadata: { _seed_key: 'role.combo.admin_user' },
    },
    targeting: { type: 'role_combo', roleNames: ['admin', 'user'] },
  },

  // ── Unread; role broadcast combo: operator + user ─────────────────────────
  {
    seed_key: 'role.combo.operator_user',
    data: {
      type: 'info',
      label: 'Test role-combo broadcast: operator + user',
      text: 'Seed test notification targeted to users in operator or user roles.',
      metadata: { _seed_key: 'role.combo.operator_user' },
    },
    targeting: { type: 'role_combo', roleNames: ['operator', 'user'] },
  },

  // ── Unread; role broadcast combo: admin + operator ────────────────────────
  {
    seed_key: 'role.combo.admin_operator',
    data: {
      type: 'info',
      label: 'Test role-combo broadcast: admin + operator',
      text: 'Seed test notification targeted to users in admin or operator roles.',
      metadata: { _seed_key: 'role.combo.admin_operator' },
    },
    targeting: { type: 'role_combo', roleNames: ['admin', 'operator'] },
  },

  // ── Unread; role broadcast combo: admin + operator + user ─────────────────
  {
    seed_key: 'role.combo.admin_operator_user',
    data: {
      type: 'info',
      label: 'Test role-combo broadcast: admin + operator + user',
      text: 'Seed test notification targeted to users in admin, operator, or user roles.',
      metadata: { _seed_key: 'role.combo.admin_operator_user' },
    },
    targeting: { type: 'role_combo', roleNames: ['admin', 'operator', 'user'] },
  },

];

// One-off notifications — always created fresh, no seed_key, no dedup check.
// These model transient real-world events a user accumulates over time.
const ONEOFF_DEFINITIONS = [

  {
    data: {
      type: 'download',
      label: 'Your download is ready',
      text: 'The bundle for raw_data_2024_q4 is ready. The link expires in 24 hours.',
      metadata: {
        links: [
          {
            id: 'download-link',
            label: 'Download now',
            href: '/downloads/bundle-raw-data-2024-q4',
            trusted: true,
            open_in_new_tab: false,
          },
        ],
      },
    },
    targeting: { type: 'direct' },
  },

  {
    data: {
      type: 'export',
      label: 'Metadata export complete',
      text: 'Your metadata export for project "Genomics Q1 2025" is ready to download.',
      metadata: {
        links: [
          {
            id: 'export-file',
            label: 'Download export',
            href: '/exports/metadata-genomics-q1-2025.csv',
            trusted: true,
            open_in_new_tab: false,
          },
        ],
      },
    },
    targeting: { type: 'direct' },
  },

  {
    data: {
      type: 'system',
      label: 'Session about to expire',
      text: 'Your session will expire in 10 minutes. Save your work and re-authenticate to continue.',
    },
    targeting: { type: 'direct' },
  },

];

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(tag, label, extra = '') {
  const pad = tag.padEnd(10);
  console.log(`  [${pad}] ${label}${extra ? `  — ${extra}` : ''}`);
}

function withTestNotificationPrefix({ id, text }) {
  const prefix = `(test notification #${id})`;
  const baseText = (text || '').trim();
  return baseText ? `${prefix} ${baseText}` : prefix;
}

async function buildRecipientRows({
  prismaClient, targeting, targetUser, roleByName,
}) {
  if (targeting.type === 'direct') {
    return [{ user_id: targetUser.id, delivery_type: 'DIRECT', delivery_role_id: null }];
  }

  if (targeting.type === 'role') {
    const role = roleByName[targeting.roleName];
    if (!role) {
      throw new Error(`role '${targeting.roleName}' not found`);
    }
    const roleUsers = await prismaClient.user_role.findMany({
      where: { role_id: role.id },
      select: { user_id: true },
    });
    return roleUsers.map((ru) => ({
      user_id: ru.user_id,
      delivery_type: 'ROLE_BROADCAST',
      delivery_role_id: role.id,
    }));
  }

  if (targeting.type === 'role_combo') {
    const roleIds = targeting.roleNames
      .map((name) => roleByName[name]?.id)
      .filter(Boolean);
    if (roleIds.length !== targeting.roleNames.length) {
      throw new Error(`one or more roles not found in combo '${targeting.roleNames.join(',')}'`);
    }
    const roleUsers = await prismaClient.user_role.findMany({
      where: { role_id: { in: roleIds } },
      select: { user_id: true, role_id: true },
      orderBy: { role_id: 'asc' },
    });
    const dedupByUserId = new Map();
    roleUsers.forEach((ru) => {
      if (!dedupByUserId.has(ru.user_id)) {
        dedupByUserId.set(ru.user_id, ru.role_id);
      }
    });
    return Array.from(dedupByUserId.entries()).map(([userId, roleId]) => ({
      user_id: userId,
      delivery_type: 'ROLE_BROADCAST',
      delivery_role_id: roleId,
    }));
  }

  throw new Error(`unknown targeting type '${targeting.type}'`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nseed-notifications.js');
  console.log(`  target user : ${TARGET_USERNAME}`);
  console.log(`  force       : ${FORCE}`);
  console.log(`  dry-run     : ${DRY_RUN}`);
  console.log(`  oneoff-only : ${ONEOFF_ONLY}`);
  console.log(`  stable-only : ${STABLE_ONLY}`);
  console.log(`  no-text-prefix : ${NO_TEXT_PREFIX}`);
  console.log('');

  // Resolve target user
  const targetUser = await prisma.user.findUnique({
    where: { username: TARGET_USERNAME },
    select: { id: true, username: true },
  });
  if (!targetUser) {
    console.error(`Error: user '${TARGET_USERNAME}' not found.`);
    process.exit(1);
  }

  // Resolve roles (keyed by name)
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const roleByName = roles.reduce((acc, r) => { acc[r.name] = r; return acc; }, {});

  // Use target user as the notification creator
  const creatorId = targetUser.id;

  const summary = {
    created: 0, skipped: 0, recreated: 0, oneoff: 0, errors: 0,
  };

  // ── Stable notifications ───────────────────────────────────────────────────

  if (!ONEOFF_ONLY) {
    console.log('Stable notifications:');

    for (const def of STABLE_DEFINITIONS) {
      try {
        // Build recipient list
        const recipientRows = await buildRecipientRows({
          prismaClient: prisma,
          targeting: def.targeting,
          targetUser,
          roleByName,
        });

        // Check for existing notification with this seed_key for the target user
        const existing = await prisma.notification.findFirst({
          where: {
            metadata: { path: ['_seed_key'], equals: def.seed_key },
            recipients: { some: { user_id: targetUser.id } },
          },
          select: { id: true },
        });

        if (existing) {
          if (!FORCE) {
            log('skip', def.seed_key, `id=${existing.id}`);
            summary.skipped++;
            continue;
          }
          // --force: delete existing and fall through to recreate
          if (!DRY_RUN) {
            await prisma.notification.delete({ where: { id: existing.id } });
          }
          log('recreate', def.seed_key, `deleted id=${existing.id}`);
          summary.recreated++;
        } else {
          summary.created++;
        }

        if (DRY_RUN) {
          log(existing ? 'recreate' : 'create', def.seed_key, 'dry-run');
          continue;
        }

        const notif = await prisma.notification.create({
          data: {
            ...def.data,
            created_by_id: creatorId,
            recipients: { createMany: { data: recipientRows } },
          },
        });

        if (def.state) {
          await prisma.notification_recipient.updateMany({
            where: { notification_id: notif.id, user_id: targetUser.id },
            data: def.state,
          });
        }

        if (!NO_TEXT_PREFIX) {
          await prisma.notification.update({
            where: { id: notif.id },
            data: {
              text: withTestNotificationPrefix({
                id: notif.id,
                text: notif.text,
              }),
            },
          });
        }

        log(existing ? 'recreate' : 'create', def.seed_key, `id=${notif.id}`);
      } catch (err) {
        log('error', def.seed_key, err.message);
        summary.errors++;
      }
    }
  }

  // ── One-off notifications ──────────────────────────────────────────────────

  if (!STABLE_ONLY) {
    console.log('\nOne-off notifications:');

    for (const def of ONEOFF_DEFINITIONS) {
      try {
        const recipientRows = await buildRecipientRows({
          prismaClient: prisma,
          targeting: def.targeting,
          targetUser,
          roleByName,
        });

        if (DRY_RUN) {
          log('oneoff', def.data.label, 'dry-run');
          summary.oneoff++;
          continue;
        }

        const notif = await prisma.notification.create({
          data: {
            ...def.data,
            created_by_id: creatorId,
            recipients: { createMany: { data: recipientRows } },
          },
        });

        if (!NO_TEXT_PREFIX) {
          await prisma.notification.update({
            where: { id: notif.id },
            data: {
              text: withTestNotificationPrefix({
                id: notif.id,
                text: notif.text,
              }),
            },
          });
        }

        log('oneoff', def.data.label, `id=${notif.id}`);
        summary.oneoff++;
      } catch (err) {
        log('error', def.data.label, err.message);
        summary.errors++;
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('');
  console.log('Summary:');
  if (!ONEOFF_ONLY) {
    console.log(`  created   : ${summary.created}`);
    console.log(`  recreated : ${summary.recreated}`);
    console.log(`  skipped   : ${summary.skipped}`);
  }
  if (!STABLE_ONLY) {
    console.log(`  oneoff    : ${summary.oneoff}`);
  }
  if (summary.errors > 0) {
    console.log(`  errors    : ${summary.errors}`);
    process.exit(1);
  }
  console.log('');
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());

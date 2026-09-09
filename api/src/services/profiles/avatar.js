const path = require('path');
const crypto = require('crypto');
const fsPromises = require('fs/promises');
const config = require('config');
const createError = require('http-errors');

/**
 * Storage for group profile pictures.
 *
 * `group.avatar_key` holds a filename this module generated, never anything a caller sent.
 * The bytes sit under one directory, flat, because there are as many avatars as there are
 * groups and that is a number a directory listing can hold.
 *
 * @see docs/design/groups/profiles.md — Schema
 */

/** The formats a browser renders and a person is likely to have. */
const CONTENT_TYPES = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
});

/**
 * Two megabytes. A profile picture is rendered at 56 pixels square and never larger than
 * 200; two megabytes is far more than that needs and small enough that a hostile upload
 * cannot fill a disk one request at a time.
 */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Absolute, so a containment check against it is meaningful and sendFile accepts it. */
function avatarDir() {
  const configured = config.has('profiles.avatar_dir')
    ? config.get('profiles.avatar_dir')
    : path.join('data', 'avatars');
  return path.resolve(configured);
}

function avatarPath(key) {
  return path.resolve(avatarDir(), key);
}

/**
 * Whether a resolved path really sits inside the avatar directory.
 *
 * Keys are generated here and never taken from a request, so this cannot currently fail.
 * It is checked anyway, at the point of the read, so the guarantee is local rather than
 * spread across two files.
 */
function isInsideAvatarDir(file) {
  return file.startsWith(`${avatarDir()}${path.sep}`);
}

function contentTypeFor(key) {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * A storage key for a newly uploaded avatar.
 *
 * Random rather than derived from the group id, so replacing a picture produces a new URL
 * and no cache anywhere serves the old bytes under the new name.
 */
function newAvatarKey(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!(ext in CONTENT_TYPES)) {
    throw createError.BadRequest(
      `Unsupported image type. Use one of ${Object.keys(CONTENT_TYPES).join(', ')}`,
    );
  }
  return `${crypto.randomUUID()}${ext}`;
}

async function removeAvatar(key) {
  if (!key) return;
  await fsPromises.rm(avatarPath(key), { force: true });
}

module.exports = {
  CONTENT_TYPES,
  AVATAR_MAX_BYTES,
  avatarDir,
  avatarPath,
  isInsideAvatarDir,
  contentTypeFor,
  newAvatarKey,
  removeAvatar,
};

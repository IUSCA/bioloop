const createError = require('http-errors');

/**
 * Shape rules for the profile fields that live inside the `metadata` JSON column.
 *
 * Postgres checks nothing inside a Json column, so every rule a reader depends on is
 * checked here on write. A profile is rendered to people who are not signed in, so a
 * malformed link or an unbounded list is a defect that reaches the widest audience the
 * system has.
 *
 * @see docs/design/groups/profiles.md — Schema
 */

/** The link kinds the UI knows how to label and give an icon. */
const LINK_TYPES = Object.freeze(['website', 'ror', 'protocols', 'contact_email', 'other']);

/** Mirrors the VarChar(120) on the column, so the API refuses before Postgres does. */
const TAGLINE_MAX_CHARS = 120;

/**
 * Bounds on the JSON column. None of these is tuned; each is a legibility and
 * anti-abuse ceiling well above what a real profile uses, chosen so a single row cannot
 * grow without limit.
 */
const ABOUT_MAX_CHARS = 20_000;
const LINKS_MAX = 10;
const PUBLICATIONS_MAX = 20;
const LABEL_MAX_CHARS = 80;
const CITATION_MAX_CHARS = 500;
const TITLE_MAX_CHARS = 300;

/** A DOI is a `10.` prefix, a registrant code, a slash, and a suffix. */
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EARLIEST_PUBLICATION_YEAR = 1500;

function bad(message) {
  throw createError.BadRequest(message);
}

function assertString(value, field, max) {
  if (typeof value !== 'string') bad(`${field} must be a string`);
  if (value.length > max) bad(`${field} must be ${max} characters or fewer`);
  return value;
}

/** A URL we are willing to render as a link. Refuses every scheme but http and https. */
function assertHttpUrl(value, field) {
  assertString(value, field, 2000);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return bad(`${field} must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    bad(`${field} must be an http or https URL`);
  }
  return value;
}

/**
 * A tagline is one line under the name. Null clears it; a blank string is refused rather
 * than stored, because the database check constraint would refuse it anyway and a 400
 * naming the field reads better than a constraint violation.
 */
function validateTagline(value) {
  if (value === null) return null;
  assertString(value, 'tagline', TAGLINE_MAX_CHARS);
  if (value.trim() === '') bad('tagline must not be blank');
  return value.trim();
}

function validateAboutMd(value) {
  if (value === null) return null;
  return assertString(value, 'about_md', ABOUT_MAX_CHARS);
}

function validateCitation(value) {
  if (value === null) return null;
  assertString(value, 'citation', CITATION_MAX_CHARS);
  return value.trim() === '' ? null : value.trim();
}

function validateLinks(value) {
  if (value === null) return [];
  if (!Array.isArray(value)) bad('links must be an array');
  if (value.length > LINKS_MAX) bad(`links must hold ${LINKS_MAX} entries or fewer`);

  return value.map((link, i) => {
    if (!link || typeof link !== 'object') bad(`links[${i}] must be an object`);
    if (!LINK_TYPES.includes(link.type)) {
      bad(`links[${i}].type must be one of ${LINK_TYPES.join(', ')}`);
    }
    const url = link.type === 'contact_email'
      ? assertString(link.url, `links[${i}].url`, 320)
      : assertHttpUrl(link.url, `links[${i}].url`);
    if (link.type === 'contact_email' && !EMAIL_PATTERN.test(url)) {
      bad(`links[${i}].url must be an email address`);
    }
    const label = link.label == null
      ? null
      : assertString(link.label, `links[${i}].label`, LABEL_MAX_CHARS);
    return { type: link.type, url, label };
  });
}

function validatePublications(value) {
  if (value === null) return [];
  if (!Array.isArray(value)) bad('publications must be an array');
  if (value.length > PUBLICATIONS_MAX) {
    bad(`publications must hold ${PUBLICATIONS_MAX} entries or fewer`);
  }

  const currentYear = new Date().getUTCFullYear();
  return value.map((pub, i) => {
    if (!pub || typeof pub !== 'object') bad(`publications[${i}] must be an object`);
    const doi = assertString(pub.doi, `publications[${i}].doi`, 200).trim();
    if (!DOI_PATTERN.test(doi)) bad(`publications[${i}].doi is not a DOI`);

    const title = pub.title == null
      ? null
      : assertString(pub.title, `publications[${i}].title`, TITLE_MAX_CHARS);
    const container = pub.container == null
      ? null
      : assertString(pub.container, `publications[${i}].container`, TITLE_MAX_CHARS);

    let year = null;
    if (pub.year != null) {
      year = Number(pub.year);
      // A publication may be forthcoming, so next year is legal and the year after is not.
      if (!Number.isInteger(year)
        || year < EARLIEST_PUBLICATION_YEAR
        || year > currentYear + 1) {
        bad(`publications[${i}].year is out of range`);
      }
    }
    return {
      doi, title, container, year,
    };
  });
}

module.exports = {
  LINK_TYPES,
  TAGLINE_MAX_CHARS,
  ABOUT_MAX_CHARS,
  LINKS_MAX,
  PUBLICATIONS_MAX,
  validateTagline,
  validateAboutMd,
  validateCitation,
  validateLinks,
  validatePublications,
};

const { constants } = require('node:fs');
const fs = require('fs');
const express = require('express');
const { query } = require('express-validator');
const path = require('node:path');
const createError = require('http-errors');

const config = require('config');
// eslint-disable-next-line lodash-fp/use-fp
const _ = require('lodash');
const prisma = require('@/db');
const logger = require('@/services/logger');
const asyncHandler = require('../middleware/asyncHandler');
const { accessControl } = require('../middleware/auth');

const isPermittedTo = accessControl('fs');
const router = express.Router();

/**
 * Check if a directory contains files with the specified extension.
 * @param {string} dirPath - Path to the directory to check
 * @param {string} extension - File extension to look for (e.g., '.fastq.gz')
 * @returns {Promise<boolean>}
 */
function directoryContainsExtension(dirPath, extension) {
  return new Promise((resolve) => {
    if (!extension) {
      resolve(true);
      return;
    }

    fs.readdir(dirPath, { withFileTypes: true }, (err, files) => {
      if (err) {
        logger.warn('[FS] Error reading directory for extension check', {
          dirPath,
          extension,
          error: err.message,
        });
        resolve(false);
        return;
      }

      const hasMatchingFiles = files.some((file) => {
        if (file.isDirectory()) return false;
        return file.name.endsWith(extension);
      });

      resolve(hasMatchingFiles);
    });
  });
}

/**
 * Given a path, find the configured mount mapping whose base_dir is a prefix
 * of that path. Returns { baseDir, mountDir } or null.
 */
function findMountMapping(targetPath) {
  const baseDirs = config.get('filesystem.base_dir');
  const mountDirs = config.get('filesystem.mount_dir');

  const matchingKey = Object.keys(baseDirs).find((key) => {
    const baseDir = baseDirs[key];
    if (!baseDir) return false;
    const normalized = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
    return targetPath === baseDir || targetPath.startsWith(normalized);
  });

  if (!matchingKey) return null;
  return { baseDir: baseDirs[matchingKey], mountDir: mountDirs[matchingKey] };
}

/**
 * Translate a user-visible path (under baseDir) to the actual mounted path
 * accessible by the API process (under mountDir).
 */
function toMountedPath(userPath, baseDir, mountDir) {
  const relative = userPath.slice(baseDir.length);
  return path.join(mountDir, relative);
}

/**
 * Middleware: resolve the import source for a requested path by finding which
 * configured import_source's path is a prefix of the requested path.
 *
 * This is the allowlist enforcement: paths are only served if they fall within
 * a configured import source. No client-supplied import source ID is needed —
 * the server derives policy entirely from the path itself.
 */
async function resolveImportSource(req, res, next) {
  const { path: queryPath } = req.query;

  if (!queryPath) {
    logger.warn('[FS] resolveImportSource called without path');
    return next(createError.Forbidden());
  }

  // Preserve trailing slash before normalization
  req.hasTrailingSlash = queryPath.endsWith('/');

  const normalized = path.normalize(queryPath);
  if (!normalized || !path.isAbsolute(normalized)) {
    logger.warn('[FS] Path not absolute after normalization', { queryPath, normalized });
    return res.status(400).send('Invalid path');
  }

  const resolved = path.resolve(normalized);

  // Find a matching import source whose path is a prefix of the requested path
  const importSources = await prisma.import_source.findMany();
  const importSource = importSources.find((source) => {
    const sourceWithSlash = source.path.endsWith('/') ? source.path : `${source.path}/`;
    return resolved === source.path || resolved.startsWith(sourceWithSlash);
  });

  if (!importSource) {
    logger.warn('[FS] No import source found for path — access denied', { resolved });
    return res.status(403).send('Forbidden');
  }

  // Find docker/container mount mapping for this source
  const mapping = findMountMapping(importSource.path);
  if (!mapping) {
    logger.error('[FS] No mount mapping found for import source', { sourcePath: importSource.path });
    return res.status(500).send('Filesystem configuration error');
  }

  req.query.path = resolved;
  req.importSource = importSource;
  req.mountMapping = mapping;

  logger.info('[FS] resolveImportSource passed', {
    sourcePath: importSource.path,
    resolvedPath: resolved,
    baseDir: mapping.baseDir,
    mountDir: mapping.mountDir,
    hasTrailingSlash: req.hasTrailingSlash,
  });

  return next();
}

router.get(
  '/',
  asyncHandler(resolveImportSource),
  isPermittedTo('read'),
  query('dirs_only').default(false),
  query('extension').optional().trim(),
  asyncHandler(async (req, res, next) => {
    const { dirs_only, path: query_path, extension } = req.query;
    const { baseDir, mountDir } = req.mountMapping;
    const { hasTrailingSlash } = req;

    logger.info('[FS] Request received', {
      query_path,
      dirs_only,
      import_source: req.importSource.path,
      extension,
      user: req.user?.username,
    });

    if (!query_path) {
      logger.info('[FS] No query_path provided, returning empty array');
      res.json([]);
      return;
    }

    const mounted_search_dir = toMountedPath(query_path, baseDir, mountDir);

    logger.info('[FS] Path resolution', {
      baseDir,
      mountDir,
      mounted_search_dir,
      query_path,
    });

    fs.access(mounted_search_dir, constants.F_OK, (err) => {
      if (err) {
        logger.info('[FS] Exact path not found, attempting substring match', {
          mounted_search_dir,
          error: err.message,
          code: err.code,
        });

        const parent_query_path = path.dirname(query_path);
        const search_term = path.basename(query_path);
        const parent_mounted_dir = toMountedPath(parent_query_path, baseDir, mountDir);

        logger.info('[FS] Attempting case-insensitive substring match', {
          parent_query_path,
          search_term,
          parent_mounted_dir,
        });

        // Ensure the parent path is still within the import source
        const sourcePath = req.importSource.path;
        const sourcePathWithSlash = sourcePath.endsWith('/') ? sourcePath : `${sourcePath}/`;
        if (parent_query_path !== sourcePath && !parent_query_path.startsWith(sourcePathWithSlash)) {
          logger.warn('[FS] Parent path outside import source', { parent_query_path, sourcePath });
          res.json([]);
          return;
        }

        fs.access(parent_mounted_dir, constants.F_OK, (parentErr) => {
          if (parentErr) {
            logger.warn('[FS] Parent directory access failed', {
              parent_mounted_dir,
              error: parentErr.message,
            });
            res.json([]);
            return;
          }

          fs.readdir(parent_mounted_dir, { withFileTypes: true }, (readErr, files) => {
            if (readErr) {
              logger.error('[FS] Error reading parent directory', {
                parent_mounted_dir,
                error: readErr.message,
              });
              res.json([]);
              return;
            }

            let matchingFiles = files
              .filter((f) => {
                const nameMatches = f.name.toLowerCase().includes(search_term.toLowerCase());
                const isDirCheck = dirs_only ? f.isDirectory() : true;
                return nameMatches && isDirCheck;
              })
              .map((f) => ({
                name: f.name,
                isDir: f.isDirectory(),
                path: path.join(parent_query_path, f.name),
              }));

            if (extension && dirs_only) {
              const extensionFilterPromises = matchingFiles.map(async (file) => {
                if (!file.isDir) return file;
                const mountedPath = toMountedPath(file.path, baseDir, mountDir);
                const hasExtension = await directoryContainsExtension(mountedPath, extension);
                return hasExtension ? file : null;
              });

              Promise.all(extensionFilterPromises).then((filtered) => {
                matchingFiles = _.compact(filtered);
                logger.info('[FS] Substring match results (after extension filter)', {
                  search_term,
                  extension,
                  total_matches: matchingFiles.length,
                });
                res.json(matchingFiles);
              });
            } else {
              logger.info('[FS] Substring match results', {
                search_term,
                total_matches: matchingFiles.length,
              });
              res.json(matchingFiles);
            }
          });
        });
        return;
      }

      if (!hasTrailingSlash) {
        logger.info('[FS] Exact path found without trailing slash, returning directory as match', {
          query_path,
        });

        const dirResult = {
          name: path.basename(query_path),
          isDir: true,
          path: query_path,
        };

        if (extension && dirs_only) {
          directoryContainsExtension(mounted_search_dir, extension).then((hasExtension) => {
            res.json(hasExtension ? [dirResult] : []);
          });
        } else {
          res.json([dirResult]);
        }
        return;
      }

      logger.info('[FS] Exact path found with trailing slash, returning directory contents', {
        mounted_search_dir,
      });

      fs.readdir(mounted_search_dir, { withFileTypes: true }, (_err, files) => {
        if (_err) {
          logger.error('[FS] Error reading directory', {
            mounted_search_dir,
            error: _err.message,
            code: _err.code,
          });
          return next(createError.InternalServerError('Error reading directory'));
        }

        logger.info('[FS] Directory read successful', {
          mounted_search_dir,
          total_entries: files ? files.length : 0,
        });

        let filesData = files.map((f) => {
          const file = {
            name: f.name,
            isDir: f.isDirectory(),
            path: path.join(query_path, f.name),
          };
          if (dirs_only) return file.isDir ? file : null;
          return file;
        });
        filesData = _.compact(filesData);

        if (extension && dirs_only) {
          const extensionFilterPromises = filesData.map(async (file) => {
            if (!file.isDir) return file;
            const mountedPath = path.join(mounted_search_dir, file.name);
            const hasExtension = await directoryContainsExtension(mountedPath, extension);
            return hasExtension ? file : null;
          });

          Promise.all(extensionFilterPromises).then((filtered) => {
            filesData = _.compact(filtered);
            logger.info('[FS] Response prepared (after extension filter)', {
              dirs_only,
              extension,
              total_before_filter: files ? files.length : 0,
              total_after_filter: filesData.length,
            });
            res.json(filesData);
          });
        } else {
          logger.info('[FS] Response prepared', {
            dirs_only,
            total_before_filter: files ? files.length : 0,
            total_after_filter: filesData.length,
          });
          res.json(filesData);
        }
      });
    });
  }),
);

module.exports = router;

/**
 * Format file size in bytes to human readable format
 * @param {number} bytes - File size in bytes
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes, decimals = 2) {
  if (bytes === 0 || bytes === null || bytes === undefined) {
    return '0 Bytes'
  }

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * Format file size in bytes to human readable format with binary prefixes
 * @param {number} bytes - File size in bytes
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted file size with binary prefixes
 */
export function formatFileSizeBinary(bytes, decimals = 2) {
  if (bytes === 0 || bytes === null || bytes === undefined) {
    return '0 Bytes'
  }

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * Parse human readable file size back to bytes
 * @param {string} sizeString - Human readable file size (e.g., "1.5 MB")
 * @returns {number} Size in bytes
 */
export function parseFileSize(sizeString) {
  if (!sizeString || typeof sizeString !== 'string') {
    return 0
  }

  const units = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024,
    'PB': 1024 * 1024 * 1024 * 1024 * 1024,
    'KiB': 1024,
    'MiB': 1024 * 1024,
    'GiB': 1024 * 1024 * 1024,
    'TiB': 1024 * 1024 * 1024 * 1024,
    'PiB': 1024 * 1024 * 1024 * 1024 * 1024,
  }

  const match = sizeString.match(/^([\d.]+)\s*([A-Za-z]+)$/)
  if (!match) {
    return 0
  }

  const [, value, unit] = match
  const multiplier = units[unit.toUpperCase()]
  
  if (!multiplier) {
    return 0
  }

  return parseFloat(value) * multiplier
} 
import { cmp } from "@/services/utils";

export const FILE_SIZE_UNITS = ["Bytes", "KB", "MB", "GB", "TB"];

const BYTES_PER_UNIT = 1024;
const MAX_UNIT_INDEX = FILE_SIZE_UNITS.length - 1;

export function getShortPath(path = "", isDirectory = false) {
  if (!path) return "";

  const parts = path.split("/");

  if (!isDirectory) {
    if (parts.length >= 4) {
      return `.../${parts.slice(-3, -1).join("/")}/`;
    }
    return `${parts.slice(0, -1).join("/")}/`;
  }

  if (parts.length >= 3) {
    return `.../${parts.slice(-2).join("/")}`;
  }
  return parts.join("/");
}

export function getParentPath(path = "") {
  if (!path) return "";

  const parts = path.split("/");
  return parts.slice(0, -1).join("/");
}

export function getBreadcrumbItems(path = "") {
  const parts = path.split("/").filter(Boolean);

  return parts.map((name, index) => ({
    name,
    rel_path: parts.slice(0, index + 1).join("/"),
  }));
}

export function encodeFileSize(bytes) {
  if (bytes === null || bytes === undefined || bytes === 0) {
    return { size: 0, units: FILE_SIZE_UNITS[0] };
  }

  if (!Number.isFinite(bytes)) {
    return { size: 1023, units: FILE_SIZE_UNITS[MAX_UNIT_INDEX] };
  }

  const unitIndex = Math.min(
    Math.max(Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)), 0),
    MAX_UNIT_INDEX,
  );
  const size = Number.parseFloat(
    (bytes / Math.pow(BYTES_PER_UNIT, unitIndex)).toFixed(2),
  );

  return { size, units: FILE_SIZE_UNITS[unitIndex] };
}

export function decodeFileSize(size, units) {
  const numericSize = Number.parseFloat(size);
  if (!numericSize) return 0;

  const unitIndex = FILE_SIZE_UNITS.indexOf(units);
  if (unitIndex === -1) return 0;

  if (numericSize >= 1023 && unitIndex === MAX_UNIT_INDEX) {
    return Infinity;
  }

  return numericSize * Math.pow(BYTES_PER_UNIT, unitIndex);
}

export function getFileExtension(name = "") {
  const parts = name.split(".");
  return parts.length > 1 ? parts.at(-1) : "";
}

export function createFileTableRows(files = []) {
  return files.map((file) => ({
    ...file,
    filetype:
      file.filetype === "directory"
        ? file.filetype
        : `.${getFileExtension(file.name)}`,
    typeSortableName: {
      name: file.name,
      filetype: file.filetype,
    },
  }));
}

export function compareFileNames(first, second) {
  if (first.filetype === second.filetype) {
    return cmp(first.name, second.name);
  }
  return first.filetype === "directory" ? -1 : 1;
}

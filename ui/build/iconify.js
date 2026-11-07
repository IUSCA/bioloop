import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import mdi from "@iconify-json/mdi/icons.json";
import materialSymbols from "@iconify-json/material-symbols/icons.json";
import vscodeIcons from "@iconify-json/vscode-icons/icons.json";
import { getIconData } from "@iconify/utils";

import { materialIconAliases } from "../src/materialIconAliases";
import {
  vsiFileExtensionsToIcons,
  vsiFileNamesToIcons,
} from "../src/components/filebrowser/vsiFileIconName";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const virtualId = "virtual:bioloop-icons";
const resolvedId = `\0${virtualId}`;
const fileIconsId = "virtual:bioloop-file-icons";
const resolvedFileIconsId = `\0${fileIconsId}`;
const collections = {
  mdi,
  "material-symbols": materialSymbols,
  "vscode-icons": vscodeIcons,
};

function isIconSource(filename) {
  return /\.(vue|js)$/.test(filename) && !/\.(spec|test)\./.test(filename);
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filename);
    return isIconSource(entry.name) ? [filename] : [];
  });
}

function readIconNames(source) {
  return new Set(
    source.match(
      /\b(?:mdi|material-symbols|vscode-icons):[a-z0-9][a-z0-9_-]*/g,
    ),
  );
}

// Vite selects SVG data here; the browser never loads the complete packs.
export function bundledIcons() {
  const iconsByFile = new Map();
  let isBuild = false;

  return {
    name: "bioloop-bundled-icons",
    configResolved({ command }) {
      isBuild = command === "build";
    },
    resolveId(id) {
      if (id === virtualId) return resolvedId;
      if (id === fileIconsId) return resolvedFileIconsId;
    },
    load(id) {
      if (id !== resolvedId && id !== resolvedFileIconsId) return;
      const fileIconsOnly = id === resolvedFileIconsId;
      const names = new Set(
        Object.values(materialIconAliases).map((name) => `mdi:${name}`),
      );
      names.add("mdi:help-circle-outline");
      for (const filename of sourceFiles(sourceRoot)) {
        // Build watch needs these files. In dev, adding them would make every
        // component a dependency of the global icon module in Vite's graph.
        if (isBuild) this.addWatchFile(filename);
        const icons = readIconNames(fs.readFileSync(filename, "utf8"));
        if (!isBuild) iconsByFile.set(filename, icons);
        for (const icon of icons) names.add(icon);
      }
      for (const name of Object.values({
        ...vsiFileExtensionsToIcons,
        ...vsiFileNamesToIcons,
      })) {
        names.add(`vscode-icons:file-type-${name.replaceAll("_", "-")}`);
      }
      const selected = {};
      const fallback = getIconData(mdi, "file");
      const legacyFileIcons = [];
      for (const icon of names) {
        const separator = icon.indexOf(":");
        const prefix = icon.slice(0, separator);
        const name = icon.slice(separator + 1);
        if (name.endsWith("-")) continue;
        if ((prefix === "vscode-icons") !== fileIconsOnly) continue;
        let data = getIconData(collections[prefix], name);
        if (!data && prefix === "vscode-icons") {
          data = fallback;
          legacyFileIcons.push(name);
        }
        if (!data) this.error(`Unknown bundled icon: ${icon}`);
        selected[prefix] ??= { prefix, icons: {} };
        selected[prefix].icons[name] = data;
      }
      if (legacyFileIcons.length) {
        this.warn(
          `Legacy file-type icons use the generic file fallback: ${legacyFileIcons.join(", ")}.`,
        );
      }
      return [
        'import { addCollection } from "@iconify/vue/offline";',
        ...Object.values(selected).map(
          (data) => `addCollection(${JSON.stringify(data)});`,
        ),
      ].join("\n");
    },
    handleHotUpdate: {
      // Vue filters the component modules first. Append icon modules afterward.
      order: "post",
      async handler({ file, modules, read, server }) {
        const filename = path.normalize(file);
        if (
          !filename.startsWith(`${sourceRoot}${path.sep}`) ||
          !isIconSource(path.basename(filename))
        )
          return;

        const icons = readIconNames(await read());
        const previousIcons = iconsByFile.get(filename) ?? new Set();
        if (
          icons.size === previousIcons.size &&
          [...icons].every((icon) => previousIcons.has(icon))
        )
          return;

        iconsByFile.set(filename, icons);
        const iconModules = [resolvedId, resolvedFileIconsId]
          .map((id) => server.moduleGraph.getModuleById(id))
          .filter(Boolean);
        return [...new Set([...modules, ...iconModules])];
      },
    },
  };
}

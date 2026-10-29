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

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filename);
    return /\.(vue|js)$/.test(entry.name) && !/\.(spec|test)\./.test(entry.name)
      ? [filename]
      : [];
  });
}

// Vite selects SVG data here; the browser never loads the complete packs.
export function bundledIcons() {
  return {
    name: "bioloop-bundled-icons",
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
        this.addWatchFile(filename);
        const source = fs.readFileSync(filename, "utf8");
        for (const match of source.matchAll(
          /\b(mdi|material-symbols|vscode-icons):([a-z0-9][a-z0-9_-]*)/g,
        )) {
          names.add(`${match[1]}:${match[2]}`);
        }
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
    handleHotUpdate({ file, server }) {
      if (file.startsWith(sourceRoot)) {
        const modules = [resolvedId, resolvedFileIconsId]
          .map((id) => server.moduleGraph.getModuleById(id))
          .filter(Boolean);
        modules.forEach((module) =>
          server.moduleGraph.invalidateModule(module),
        );
        return modules;
      }
    },
  };
}

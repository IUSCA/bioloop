import Constants from "@/constants";
import { getManifestPath } from "@/services/upload/checksum";

export function buildUploadPayload({
  name,
  type,
  selectedRawData,
  projectSelected,
  selectedSourceInstrument,
  willCreateNewProject,
}) {
  return {
    name,
    type,

    ...(selectedRawData && {
      src_dataset_id: selectedRawData.id,
    }),

    ...(projectSelected &&
      !willCreateNewProject && {
        project_id: projectSelected.id,
      }),

    ...(selectedSourceInstrument && {
      src_instrument_id: selectedSourceInstrument.id,
    }),
  };
}

export function buildImportPayload({ selectedFile, ...rest }) {
  return {
    ...buildUploadPayload(rest),
    origin_path: selectedFile.path,
    create_method: Constants.DATASET_CREATE_METHODS.IMPORT,
  };
}

export function buildSizeManifest(files) {
  const normalized = files.map((file) => ({
    path: getManifestPath(file),
    size: file.size,
  }));

  normalized.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    mode: "path-size-v1",
    file_count: normalized.length,
    total_size: normalized.reduce((sum, f) => sum + f.size, 0),
    files: normalized,
  };
}

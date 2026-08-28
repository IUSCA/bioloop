import {
  buildImportPayload,
  buildSizeManifest,
  buildUploadPayload,
} from "@/services/dataset/payload";

import { describe, expect, it } from "vitest";

describe("buildImportPayload", () => {
  it("builds the basic import payload", () => {
    const result = buildImportPayload({
      name: "dataset-a",
      type: "RAW_DATA",
      selectedRawData: null,
      projectSelected: null,
      selectedSourceInstrument: null,
      selectedFile: { path: "/data/test" },
      willCreateNewProject: false,
    });

    expect(result).toEqual({
      name: "dataset-a",
      type: "RAW_DATA",
      origin_path: "/data/test",
      create_method: "IMPORT",
    });
  });

  it("includes selected metadata IDs", () => {
    const result = buildImportPayload({
      name: "dataset-a",
      type: "DATA_PRODUCT",
      selectedRawData: { id: 10 },
      projectSelected: { id: 20 },
      selectedSourceInstrument: { id: 30 },
      selectedFile: { path: "/data/test" },
      willCreateNewProject: false,
    });

    expect(result).toEqual({
      name: "dataset-a",
      type: "DATA_PRODUCT",
      src_dataset_id: 10,
      project_id: 20,
      src_instrument_id: 30,
      origin_path: "/data/test",
      create_method: "IMPORT",
    });
  });

  it("does not include project_id when a new project will be created", () => {
    const result = buildImportPayload({
      name: "dataset-a",
      type: "DATA_PRODUCT",
      selectedRawData: null,
      projectSelected: { id: 20 },
      selectedSourceInstrument: null,
      selectedFile: { path: "/data/test" },
      willCreateNewProject: true,
    });

    expect(result).not.toHaveProperty("project_id");
  });

  it("does not include import-only fields", () => {
    const result = buildUploadPayload({
      name: "dataset-a",
      type: "RAW_DATA",
      selectedRawData: null,
      projectSelected: null,
      selectedSourceInstrument: null,
      willCreateNewProject: false,
    });
  
    expect(result).not.toHaveProperty("origin_path");
    expect(result).not.toHaveProperty("create_method");
  });
});


describe("buildUploadPayload", () => {
  it("builds the basic upload payload", () => {
    const result = buildUploadPayload({
      name: "dataset-a",
      type: "RAW_DATA",
      selectedRawData: null,
      projectSelected: null,
      selectedSourceInstrument: null,
      willCreateNewProject: false,
    });

    expect(result).toEqual({
      name: "dataset-a",
      type: "RAW_DATA",
    });
  });

  it("includes selected metadata IDs", () => {
    const result = buildUploadPayload({
      name: "dataset-a",
      type: "DATA_PRODUCT",
      selectedRawData: { id: 10 },
      projectSelected: { id: 20 },
      selectedSourceInstrument: { id: 30 },
      willCreateNewProject: false,
    });

    expect(result).toEqual({
      name: "dataset-a",
      type: "DATA_PRODUCT",
      src_dataset_id: 10,
      project_id: 20,
      src_instrument_id: 30,
    });
  });

  it("does not include project_id when a new project will be created", () => {
    const result = buildUploadPayload({
      name: "dataset-a",
      type: "DATA_PRODUCT",
      selectedRawData: null,
      projectSelected: { id: 20 },
      selectedSourceInstrument: null,
      willCreateNewProject: true,
    });

    expect(result).not.toHaveProperty("project_id");
  });
});



describe("buildSizeManifest", () => {
  it("uses the filename for single-file uploads", () => {
    expect(
      buildSizeManifest([{ name: "a.txt", size: 12, webkitRelativePath: "" }]),
    ).toEqual({
      mode: "path-size-v1",
      file_count: 1,
      total_size: 12,
      files: [{ path: "a.txt", size: 12 }],
    });
  });

  it("strips the root directory from directory uploads and sorts by path", () => {
    expect(
      buildSizeManifest([
        {
          name: "b.txt",
          size: 2,
          webkitRelativePath: "root/sub/b.txt",
        },
        {
          name: "a.txt",
          size: 1,
          webkitRelativePath: "root/a.txt",
        },
      ]),
    ).toEqual({
      mode: "path-size-v1",
      file_count: 2,
      total_size: 3,
      files: [
        { path: "a.txt", size: 1 },
        { path: "sub/b.txt", size: 2 },
      ],
    });
  });
});
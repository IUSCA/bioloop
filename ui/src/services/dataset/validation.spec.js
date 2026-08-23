import { describe, expect, it, vi } from "vitest";

import {
  UNKNOWN_VALIDATION_ERROR,
  getDatasetExistsError,
  hasMetadataAssignmentError,
  validateDatasetName,
  validateDatasetNameFormat,
} from "@/services/dataset/validation";

const datasetTypes = [
  { label: "Raw Data", value: "RAW_DATA" },
  { label: "Data Product", value: "DATA_PRODUCT" },
];

describe("validateDatasetNameFormat", () => {
  it("rejects an empty dataset name", () => {
    expect(validateDatasetNameFormat("")).toEqual({
      isNameValid: false,
      error: "Dataset name cannot be empty",
    });
  });

  it("rejects a dataset name shorter than 3 characters", () => {
    expect(validateDatasetNameFormat("ab")).toEqual({
      isNameValid: false,
      error: "Dataset name must have 3 or more characters.",
    });
  });

  it("rejects a dataset name containing spaces", () => {
    expect(validateDatasetNameFormat("my dataset")).toEqual({
      isNameValid: false,
      error: "Dataset name cannot contain spaces",
    });
  });

  it("accepts a valid dataset name", () => {
    expect(validateDatasetNameFormat("dataset123")).toEqual({
      isNameValid: true,
      error: null,
    });
  });
});


describe("getDatasetExistsError", () => {
  it("includes the dataset type label", () => {
    expect(getDatasetExistsError("RAW_DATA", datasetTypes)).toBe(
      "A Raw Data with this name already exists.",
    );
  });
});

describe("validateDatasetName", () => {
  it("returns a format error without calling checkIfExists", async () => {
    const checkIfExists = vi.fn();

    await expect(
      validateDatasetName({
        name: "ab",
        datasetType: "RAW_DATA",
        datasetTypes,
        checkIfExists,
      }),
    ).resolves.toEqual({
      isNameValid: false,
      error: "Dataset name must have 3 or more characters.",
    });

    expect(checkIfExists).not.toHaveBeenCalled();
  });

  it("accepts a unique dataset name", async () => {
    await expect(
      validateDatasetName({
        name: "unique-name",
        datasetType: "DATA_PRODUCT",
        datasetTypes,
        checkIfExists: vi.fn().mockResolvedValue(false),
      }),
    ).resolves.toEqual({
      isNameValid: true,
      error: null,
    });
  });

  it("rejects a duplicate dataset name", async () => {
    await expect(
      validateDatasetName({
        name: "existing-name",
        datasetType: "DATA_PRODUCT",
        datasetTypes,
        checkIfExists: vi.fn().mockResolvedValue(true),
      }),
    ).resolves.toEqual({
      isNameValid: false,
      error: "A Data Product with this name already exists.",
    });
  });

  it("returns an unknown validation error when duplicate check fails", async () => {
    await expect(
      validateDatasetName({
        name: "dataset123",
        datasetType: "RAW_DATA",
        datasetTypes,
        checkIfExists: vi.fn().mockRejectedValue(new Error("network")),
      }),
    ).resolves.toEqual({
      isNameValid: false,
      error: UNKNOWN_VALIDATION_ERROR,
    });
  });
});

describe("hasMetadataAssignmentError", () => {
  it("returns false when no metadata assignments are enabled", () => {
    expect(
      hasMetadataAssignmentError({
        willAssignSourceRawData: false,
        selectedRawData: null,
        willAssignProject: false,
        projectSelected: null,
        willAssignSourceInstrument: false,
        selectedSourceInstrument: null,
      }),
    ).toBe(false);
  });

  it("returns true when source Raw Data assignment is enabled but none is selected", () => {
    expect(
      hasMetadataAssignmentError({
        willAssignSourceRawData: true,
        selectedRawData: null,
        willAssignProject: false,
        projectSelected: null,
        willAssignSourceInstrument: false,
        selectedSourceInstrument: null,
      }),
    ).toBe(true);
  });

  it("returns true when project assignment is enabled but none is selected", () => {
    expect(
      hasMetadataAssignmentError({
        willAssignSourceRawData: false,
        selectedRawData: null,
        willAssignProject: true,
        projectSelected: null,
        willAssignSourceInstrument: false,
        selectedSourceInstrument: null,
      }),
    ).toBe(true);
  });

  it("returns true when source instrument assignment is enabled but none is selected", () => {
    expect(
      hasMetadataAssignmentError({
        willAssignSourceRawData: false,
        selectedRawData: null,
        willAssignProject: false,
        projectSelected: null,
        willAssignSourceInstrument: true,
        selectedSourceInstrument: null,
      }),
    ).toBe(true);
  });

  it("returns false when enabled assignments have selections", () => {
    expect(
      hasMetadataAssignmentError({
        willAssignSourceRawData: true,
        selectedRawData: { id: 1 },
        willAssignProject: true,
        projectSelected: { id: 2 },
        willAssignSourceInstrument: true,
        selectedSourceInstrument: { id: 3 },
      }),
    ).toBe(false);
  });
});
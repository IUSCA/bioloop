import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config", () => ({
  default: {
    enabledFeatures: {
      upload_verify_checksums: true,
    },
  },
}));

vi.mock("hash-wasm", () => ({
  createBLAKE3: vi.fn(),
}));

import config from "@/config";
import { createBLAKE3 } from "hash-wasm";

import {
  computeManifestHash,
  getManifestPath,
  isChecksumVerificationEnabled,
} from "@/services/upload/checksum";

/**
 * Creates a lightweight mock File object containing only the properties
 * and methods used by the checksum service.
 */

function createMockFile({
  name,
  content = "",
  webkitRelativePath = "",
}) {
  const bytes = new TextEncoder().encode(content);

  return {
    name,
    size: bytes.byteLength,
    webkitRelativePath,

    slice(start, end) {
      const chunk = bytes.slice(start, end);

      return {
        async arrayBuffer() {
          return chunk.buffer.slice(
            chunk.byteOffset,
            chunk.byteOffset + chunk.byteLength,
          );
        },
      };
    },
  };
}

/**
 * Creates a fake BLAKE3 hasher.
 *
 * Instead of calculating a real cryptographic hash, digest() returns
 * the text that was passed to update(). This makes it easy to verify
 * that our manifest is constructed correctly.
 */

function createMockHasher() {
  let bytes = [];

  return {
    init: vi.fn(() => {
      bytes = [];
    }),

    update: vi.fn((value) => {
      bytes.push(...value);
    }),

    digest: vi.fn(() => {
      if (bytes.length === 0) {
        return "EMPTY_HASH";
      }

      return new TextDecoder().decode(Uint8Array.from(bytes));
    }),
  };
}

describe("getManifestPath", () => {
   /**
   * Single-file uploads do not have a webkitRelativePath,
   * so the manifest should use the file name directly.
   */
  it("uses the filename for a single-file upload", () => {
    const file = {
      name: "test.txt",
      webkitRelativePath: "",
    };

    expect(getManifestPath(file)).toBe("test.txt");
  });

  /**
   * Directory uploads include the root directory in webkitRelativePath.
   * The root directory must be removed so the client manifest matches
   * the server-side relative file path.
   */

  it("strips the root directory from directory uploads", () => {
    const file = {
      name: "test.txt",
      webkitRelativePath: "root/sub/test.txt",
    };

    expect(getManifestPath(file)).toBe("sub/test.txt");
  });

  /**
   * Windows-style backslashes should be normalized to forward slashes
   * so manifest paths are consistent across operating systems.
   */

  it("normalizes backslashes in directory paths", () => {
    const file = {
      name: "test.txt",
      webkitRelativePath: "root\\sub\\test.txt",
    };

    expect(getManifestPath(file)).toBe("sub/test.txt");
  });

   /**
   * Single-file paths beginning with "./" should be normalized
   * to the plain filename used by the manifest.
   */

  it("normalizes a single-file path", () => {
    const file = {
      name: "./test.txt",
      webkitRelativePath: "",
    };

    expect(getManifestPath(file)).toBe("test.txt");
  });
});

describe("computeManifestHash", () => {
  beforeEach(() => {
    config.enabledFeatures.upload_verify_checksums = true;

    vi.clearAllMocks();
  });

  it("returns null when checksum verification is disabled", async () => {
    config.enabledFeatures.upload_verify_checksums = false;

    const files = [
      createMockFile({
        name: "test.txt",
        content: "hello",
      }),
    ];

    const result = await computeManifestHash(files);

    expect(result).toBeNull();
    expect(createBLAKE3).not.toHaveBeenCalled();
  });

/**
   * When checksum verification is disabled, no checksum work should
   * be performed and the function should return null.
   */

  it("returns null when no files are provided", async () => {
    expect(await computeManifestHash([])).toBeNull();
    expect(await computeManifestHash(null)).toBeNull();

    expect(createBLAKE3).not.toHaveBeenCalled();
  });

  /**
   * Verifies the normal success path for a single file:
   * file hash -> manifest entry -> final manifest hash result.
   */

  it("computes a manifest hash for a single file", async () => {
    const hasher = createMockHasher();

    createBLAKE3.mockResolvedValue(hasher);

    const result = await computeManifestHash([
      createMockFile({
        name: "test.txt",
        content: "hello",
      }),
    ]);

    expect(result).toMatchObject({
      algorithm: "blake3",
      mode: "manifest-v1",
      file_count: 1,
      total_size: 5,
    });

    // The fake hasher lets us verify the exact manifest string
    // passed into the final manifest-hash operation.

    expect(result.manifest_hash).toBe(
      [
        "blake3-manifest-v1",
        "test.txt\t5\thello",
      ].join("\n"),
    );

    expect(result.computed_at).toEqual(expect.any(String));
  });


 /**
   * Directory uploads must remove the top-level directory name
   * before creating the manifest entry.
   */

  it("strips the root directory from manifest paths", async () => {
    const hasher = createMockHasher();

    createBLAKE3.mockResolvedValue(hasher);

    const result = await computeManifestHash([
      createMockFile({
        name: "test.txt",
        content: "hello",
        webkitRelativePath: "root/sub/test.txt",
      }),
    ]);

    expect(result.manifest_hash).toBe(
      [
        "blake3-manifest-v1",
        "sub/test.txt\t5\thello",
      ].join("\n"),
    );
  });

  /**
   * Manifest entries must always be sorted by path.
   * This guarantees the same manifest hash regardless of the order
   * in which files were supplied by the browser.
   */

  it("sorts manifest entries by path for deterministic output", async () => {
    const hasher = createMockHasher();

    createBLAKE3.mockResolvedValue(hasher);

    const result = await computeManifestHash([
      createMockFile({
        name: "b.txt",
        content: "B",
        webkitRelativePath: "root/sub/b.txt",
      }),
      createMockFile({
        name: "a.txt",
        content: "A",
        webkitRelativePath: "root/a.txt",
      }),
    ]);

    expect(result).toMatchObject({
      algorithm: "blake3",
      mode: "manifest-v1",
      file_count: 2,
      total_size: 2,
    });

    expect(result.manifest_hash).toBe(
      [
        "blake3-manifest-v1",
        "a.txt\t1\tA",
        "sub/b.txt\t1\tB",
      ].join("\n"),
    );
  });



/**
   * Zero-byte files are valid files and should hash as an empty stream
   * rather than causing an error or being skipped.
   */
  it("handles zero-byte files", async () => {
    const hasher = createMockHasher();

    createBLAKE3.mockResolvedValue(hasher);

    const result = await computeManifestHash([
      createMockFile({
        name: "empty.txt",
        content: "",
      }),
    ]);

    expect(result).toMatchObject({
      algorithm: "blake3",
      mode: "manifest-v1",
      file_count: 1,
      total_size: 0,
    });

    expect(result.manifest_hash).toBe(
      [
        "blake3-manifest-v1",
        "empty.txt\t0\tEMPTY_HASH",
      ].join("\n"),
    );
  });

    /**
   * A checksum failure should not fail the entire upload.
   * Instead, the service should return a skip marker so the backend
   * knows checksum computation was attempted but failed.
   */

  it("returns a skip marker when checksum computation fails", async () => {
    createBLAKE3.mockRejectedValueOnce(
      new Error("WASM failed"),
    );

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await computeManifestHash([
      createMockFile({
        name: "test.txt",
        content: "hello",
      }),
    ]);

    expect(result).toEqual({
      skipped: true,
      skipped_reason: "client_computation_failed",
      error: "Error: WASM failed",
    });

    consoleErrorSpy.mockRestore();
  });

   /**
   * Verifies that the progress callback reaches 100% after
   * a successful checksum calculation.
   */

  it("reports 100 percent progress when hashing completes", async () => {
    const hasher = createMockHasher();

    createBLAKE3.mockResolvedValue(hasher);

    const progressCallback = vi.fn();

    await computeManifestHash(
      [
        createMockFile({
          name: "test.txt",
          content: "hello",
        }),
      ],
      progressCallback,
    );

    expect(progressCallback).toHaveBeenCalled();
    expect(progressCallback).toHaveBeenLastCalledWith(100);
  });
  
   /**
   * Verifies that overall progress is calculated correctly when
   * multiple files are processed and still finishes at 100%.
   */
  
  it("reports overall progress across multiple files", async () => {
    const hasher = createMockHasher();

    createBLAKE3.mockResolvedValue(hasher);

    const progressCallback = vi.fn();

    await computeManifestHash(
      [
        createMockFile({
          name: "a.txt",
          content: "hello",
        }),
        createMockFile({
          name: "b.txt",
          content: "world",
        }),
      ],
      progressCallback,
    );

    expect(progressCallback).toHaveBeenCalled();
    expect(progressCallback).toHaveBeenLastCalledWith(100);
  });
});

describe("isChecksumVerificationEnabled", () => {
  beforeEach(() => {
    config.enabledFeatures.upload_verify_checksums = true;
  });

   /**
   * The helper should return true when checksum verification
   * is enabled in application configuration.
   */

  it("returns true when checksum verification is enabled", () => {
    config.enabledFeatures.upload_verify_checksums = true;

    expect(isChecksumVerificationEnabled()).toBe(true);
  });

  /**
   * The helper should return false when checksum verification
   * is disabled in application configuration.
   */

  it("returns false when checksum verification is disabled", () => {
    config.enabledFeatures.upload_verify_checksums = false;

    expect(isChecksumVerificationEnabled()).toBe(false);
  });
});
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import useQueryPersistence from "@/composables/useQueryPersistence";
import { useFileBrowserStore } from "@/stores/fileBrowser";

// Keep these tests focused on store behavior without requiring Vue Router.
vi.mock("@/composables/useQueryPersistence", () => ({
  default: vi.fn(),
}));

const defaultFilters = {
  name: "",
  location: "/",
  filetype: "any",
  extension: "",
  minSize: 0,
  maxSize: Infinity,
};

describe("useFileBrowserStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe("Initial state", () => {
    // Verifies the state shown when a file browser is first opened.
    it("starts at the root with search mode disabled", () => {
      const store = useFileBrowserStore();

      expect(store.pwd).toBe("");
      expect(store.isInSearchMode).toBe(false);
      expect(store.filters).toEqual(defaultFilters);
    });

    // Verifies callers cannot accidentally mutate the shared defaults.
    it("creates a fresh set of default filters", () => {
      const store = useFileBrowserStore();
      const filters = store.defaultFilters();

      filters.name = "changed";

      expect(store.defaultFilters()).toEqual(defaultFilters);
    });
  });

  describe("Filter state", () => {
    // Verifies the complete filter form can be applied to the store.
    it("replaces the filters", () => {
      const store = useFileBrowserStore();
      const filters = {
        ...defaultFilters,
        name: "sample",
        extension: "fastq",
      };

      store.setFilters(filters);

      expect(store.filters).toEqual(filters);
    });

    // Verifies the UI can identify which filters are currently active.
    it("reports which filters differ from their defaults", () => {
      const store = useFileBrowserStore();

      store.filters.name = "sample";
      store.filters.maxSize = 1024;

      expect(store.filterStatus).toEqual({
        name: true,
        location: false,
        filetype: false,
        extension: false,
        minSize: false,
        maxSize: true,
      });
    });

    // Verifies clearing one filter preserves all other filter values.
    it("resets one filter without changing the others", () => {
      const store = useFileBrowserStore();
      store.filters.name = "sample";
      store.filters.extension = "fastq";

      store.resetByKey("name");

      expect(store.filters.name).toBe("");
      expect(store.filters.extension).toBe("fastq");
    });

    // Verifies the clear-all action restores every filter default.
    it("resets all filters", () => {
      const store = useFileBrowserStore();
      store.setFilters({
        name: "sample",
        location: "/data",
        filetype: "file",
        extension: "fastq",
        minSize: 10,
        maxSize: 1024,
      });

      store.resetFilters();

      expect(store.filters).toEqual(defaultFilters);
    });
  });

  describe("Store reset", () => {
    // Verifies leaving/resetting the browser clears all browsing state.
    it("resets the path, search mode, and filters", () => {
      const store = useFileBrowserStore();
      store.pwd = "/data/project";
      store.isInSearchMode = true;
      store.filters.name = "sample";

      store.reset();

      expect(store.pwd).toBe("");
      expect(store.isInSearchMode).toBe(false);
      expect(store.filters).toEqual(defaultFilters);
    });
  });

  describe("Query persistence", () => {
    // Verifies file-browser state is connected to the expected URL key.
    it("persists the combined file-browser state in the q parameter", () => {
      useFileBrowserStore();

      expect(useQueryPersistence).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "q",
          history_push: true,
        }),
      );
    });

    // Verifies persisted URL state can be written back into the store.
    it("restores path, search mode, and filters from persisted state", () => {
      const store = useFileBrowserStore();
      const [{ refObject }] = vi.mocked(useQueryPersistence).mock.calls[0];

      refObject.value = {
        pwd: "/restored",
        isInSearchMode: true,
        filters: {
          ...defaultFilters,
          extension: "csv",
        },
      };

      expect(store.pwd).toBe("/restored");
      expect(store.isInSearchMode).toBe(true);
      expect(store.filters.extension).toBe("csv");
    });
  });
});

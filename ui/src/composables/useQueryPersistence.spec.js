import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import useQueryPersistence from "@/composables/useQueryPersistence";

vi.mock("vue-router", () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(),
}));

describe("useQueryPersistence", () => {
  let route;
  let push;
  let replace;

  const defaultValueFn = () => ({
    page: 1,
    sort: "name",
  });

  beforeEach(() => {
    route = reactive({
      query: {},
    });

    push = vi.fn().mockResolvedValue(undefined);
    replace = vi.fn().mockResolvedValue(undefined);

    vi.mocked(useRoute).mockReturnValue(route);
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace,
    });

    vi.clearAllMocks();
  });

  async function flushWatchers() {
    await nextTick();
    await Promise.resolve();
  }

  describe("Initial state", () => {
    it("uses default values when the query parameter does not exist", () => {
      const state = ref({});

      useQueryPersistence({
        refObject: state,
        defaultValueFn,
      });

      expect(state.value).toEqual({
        page: 1,
        sort: "name",
      });
    });

    it("overrides default values with values from the query parameter", () => {
      route.query.q = JSON.stringify({
        page: 3,
      });

      const state = ref({});

      useQueryPersistence({
        refObject: state,
        defaultValueFn,
      });

      expect(state.value).toEqual({
        page: 3,
        sort: "name",
      });
    });

    it("falls back to default values when the query contains invalid JSON", () => {
      route.query.q = "{invalid-json";

      const state = ref({});

      useQueryPersistence({
        refObject: state,
        defaultValueFn,
      });

      expect(state.value).toEqual({
        page: 1,
        sort: "name",
      });
    });
  });

  describe("State to query synchronization", () => {
    it("updates the query when state changes", async () => {
      const state = ref({});

      useQueryPersistence({
        refObject: state,
        defaultValueFn,
      });

      state.value.page = 2;

      await flushWatchers();

      expect(push).toHaveBeenCalledWith({
        query: {
          q: JSON.stringify({
            page: 2,
            sort: "name",
          }),
        },
      });
    });

    it("removes the query parameter when state returns to the default value", async () => {
      route.query.q = JSON.stringify({
        page: 2,
        sort: "name",
      });

      route.query.tab = "files";

      const state = ref({});

      useQueryPersistence({
        refObject: state,
        defaultValueFn,
      });

      state.value = defaultValueFn();

      await flushWatchers();

      expect(push).toHaveBeenCalledWith({
        query: {
          tab: "files",
        },
      });
    });

    it("uses router.replace when history_push is false", async () => {
      const state = ref({});

      useQueryPersistence({
        refObject: state,
        defaultValueFn,
        history_push: false,
      });

      state.value.page = 2;

      await flushWatchers();

      expect(replace).toHaveBeenCalledWith({
        query: {
          q: JSON.stringify({
            page: 2,
            sort: "name",
          }),
        },
      });

      expect(push).not.toHaveBeenCalled();
    });
  });

  describe("Query to state synchronization", () => {
    it("updates state when the route query changes", async () => {
      const state = ref({});

      useQueryPersistence({
        refObject: state,
        defaultValueFn,
      });

      route.query.q = JSON.stringify({
        page: 5,
        sort: "date",
      });

      await flushWatchers();

      expect(state.value).toEqual({
        page: 5,
        sort: "date",
      });
    });
  });

  describe("Infinity serialization", () => {
    it("serializes Infinity and negative Infinity into the query", async () => {
      const state = ref({});

      useQueryPersistence({
        refObject: state,
        defaultValueFn,
      });

      state.value = {
        page: 1,
        min: -Infinity,
        max: Infinity,
      };

      await flushWatchers();

      const query = push.mock.calls[0][0].query.q;
      const serialized = JSON.parse(query);

      expect(serialized.min).toBe("__-Infinity__");
      expect(serialized.max).toBe("__Infinity__");
    });

    it("restores Infinity and negative Infinity from the query", () => {
      route.query.q = JSON.stringify({
        min: "__-Infinity__",
        max: "__Infinity__",
      });

      const state = ref({});

      useQueryPersistence({
        refObject: state,
        defaultValueFn,
      });

      expect(state.value.min).toBe(-Infinity);
      expect(state.value.max).toBe(Infinity);
    });
  });

  describe("Custom query key", () => {
    it("uses a custom query parameter key", async () => {
      const state = ref({});

      useQueryPersistence({
        refObject: state,
        defaultValueFn,
        key: "filters",
      });

      state.value.page = 4;

      await flushWatchers();

      expect(push).toHaveBeenCalledWith({
        query: {
          filters: JSON.stringify({
            page: 4,
            sort: "name",
          }),
        },
      });
    });
  });
});
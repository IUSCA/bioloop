import { defineStore } from "pinia";

export const useCacheStore = defineStore("cache", {
  state: () => ({
    dataCache: {},
  }),
  getters: {
    getData: (state) => (key) => state.dataCache[key],
  },
  actions: {
    setData(key, data) {
      this.dataCache[key] = data;
    },
  },
});

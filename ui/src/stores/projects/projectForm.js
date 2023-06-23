import { defineStore } from "pinia";

export const useProjectFormStore = defineStore("projectForm", {
  state: () => ({
    name: "",
    description: "",
    users: [],
    browser_enabled: false,
    funding: "",
    form: {
      isValid: false,
    },
  }),
  getters: {
    user_ids: (state) => {
      return (state.users || []).map((user) => user.id);
    },
    project_data: (state) => {
      return {
        name: state.name,
        description: state.description,
        browser_enabled: state.browser_enabled,
        funding: state.funding,
      };
    },
  },
});

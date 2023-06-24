import { defineStore } from "pinia";

export const useProjectFormStore = defineStore("projectForm", {
  state: () => ({
    name: "",
    description: "",
    user_dict: {},
    browser_enabled: false,
    funding: "",
    datasets: [],
    form: {
      isValid: false,
    },
  }),
  getters: {
    user_ids: (state) => {
      return Object.values(state.user_dict).map((user) => user.id);
    },
    project_info: (state) => {
      return {
        name: state.name,
        description: state.description,
        browser_enabled: state.browser_enabled,
        funding: state.funding,
      };
    },
    users: (state) => {
      return Object.values(state.user_dict);
    },
  },
  actions: {
    addUser(user) {
      this.user_dict[user.username] = user;
    },
    removeUser(user) {
      delete this.user_dict[[user.username]];
    },
    setUsers(users) {
      this.user_dict = users.reduce((acc, user) => {
        acc[user.username] = user;
        return acc;
      }, {});
    },
  },
});

import { defineStore } from "pinia";

export const useProjectFormStore = defineStore("projectForm", {
  state: () => ({
    name: "",
    description: "",
    user_dict: {},
    funding: "",
    dataset_dict: {},
    form: {
      isValid: false,
    },
  }),
  getters: {
    user_ids: (state) => {
      return Object.values(state.user_dict).map((user) => user.id);
    },
    dataset_ids: (state) => {
      return Object.values(state.dataset_dict).map((ds) => ds.id);
    },
    project_info: (state) => {
      return {
        name: state.name,
        description: state.description,
        funding: state.funding,
      };
    },
    users: (state) => {
      return Object.values(state.user_dict);
    },
    datasets: (state) => {
      return Object.values(state.dataset_dict);
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
    addDataset(ds) {
      this.dataset_dict[ds.id] = ds;
    },
    removeDataset(ds) {
      delete this.dataset_dict[[ds.id]];
    },
    setDatasets(datasets) {
      this.dataset_dict = datasets.reduce((acc, ds) => {
        acc[ds.id] = ds;
        return acc;
      }, {});
    },
  },
});

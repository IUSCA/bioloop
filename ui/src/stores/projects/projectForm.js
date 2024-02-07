import { defineStore } from "pinia";

export const useProjectFormStore = defineStore("projectForm", {
  state: () => ({
    name: "",
    description: "",
    user_dict: {},
    browser_enabled: false,
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
        browser_enabled: state.browser_enabled,
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
      debugger;
      if (!this.dataset_dict[ds.id]) {
        this.dataset_dict[ds.id] = ds;
      }

      // if (!this.add_dataset_ids.includes(ds.id)) {
      //   this.add_dataset_ids.push(ds.id);
      // }
      // if (this.remove_dataset_ids.includes(ds.id)) {
      //   this.remove_dataset_ids.splice(
      //     this.remove_dataset_ids.indexOf(ds.id),
      //     1,
      //   );
      // }
      debugger;
    },
    removeDataset(ds) {
      debugger;
      delete this.dataset_dict[[ds.id]];

      // if (!this.remove_dataset_ids.includes(ds.id)) {
      //   this.remove_dataset_ids.push(ds.id);
      // }
      // if (this.add_dataset_ids.includes(ds.id)) {
      //   this.add_dataset_ids.splice(this.add_dataset_ids.indexOf(ds.id), 1);
      // }
      //
      // debugger;
    },
    // setPaginatedDatasets(datasets) {
    //   debugger;
    //   this.paginated_datasets = datasets;
    // },
    // setPaginatedDatasetsTotalCount(total_count) {
    //   this.paginated_datasets_total_count = total_count;
    // },
    setDatasets(datasets) {
      this.dataset_dict = datasets.reduce((acc, ds) => {
        acc[ds.id] = ds;
        return acc;
      }, {});
    },
  },
});

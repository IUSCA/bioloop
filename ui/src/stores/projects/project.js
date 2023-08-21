import { ref } from "vue";
import { defineStore } from "pinia";

export const useProjectStore = defineStore("projectStore", () => {
  const project = ref({});

  function setProject(value) {
    project.value = value;
  }

  return {
    project,
    setProject,
  };
});

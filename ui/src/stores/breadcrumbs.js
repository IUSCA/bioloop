import { ref } from "vue";
import { defineStore } from "pinia";

export const useBreadcrumbsStore = defineStore("breadcrumbs", () => {
  const breadcrumbs = ref([]);

  function setBreadcrumbs(value) {
    breadcrumbs.value.push(value);
  }

  return { breadcrumbs, setBreadcrumbs };
});

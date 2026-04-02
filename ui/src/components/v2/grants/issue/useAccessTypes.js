import grantService from "@/services/v2/grants";

export function useAccessTypes(resourceType) {
  const accessTypes = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function fetchAccessTypes() {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await grantService.listAccessTypes(resourceType);
      accessTypes.value = data;
    } catch (err) {
      error.value = err;
    } finally {
      loading.value = false;
    }
  }

  onMounted(fetchAccessTypes);

  return { accessTypes, loading, error, refresh: fetchAccessTypes };
}

import grantService from "@/services/v2/grants";

export function useGrantPresets() {
  const presets = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function fetchPresets() {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await grantService.listGrantPresets();
      presets.value = data;
    } catch (err) {
      error.value = err;
    } finally {
      loading.value = false;
    }
  }

  onMounted(fetchPresets);

  return { presets, loading, error, refresh: fetchPresets };
}

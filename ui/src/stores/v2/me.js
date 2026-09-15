import UserService from "@/services/v2/users";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

/**
 * Three facts about the signed-in user, from `GET /v2/users/me`: whether they are a platform
 * admin, how many groups they administer, and how many they oversee.
 *
 * Pages read these to choose which sections and offers to show. No control is authorized by
 * them; every action is decided by its own route.
 *
 * @see docs/design/groups/implementation/access-model-verification-plan.md — The persona goes
 */
export const useMeStore = defineStore("v2Me", () => {
  const facts = ref(null);
  const loading = ref(false);
  const error = ref(null);

  const isLoaded = computed(() => facts.value !== null);
  const isPlatformAdmin = computed(
    () => facts.value?.is_platform_admin === true,
  );
  const adminGroupCount = computed(() => facts.value?.admin_group_count ?? 0);
  const oversightGroupCount = computed(
    () => facts.value?.oversight_group_count ?? 0,
  );
  /** Whether the user governs anything, so the dashboard shows its governance sections. */
  const governs = computed(
    () =>
      isPlatformAdmin.value ||
      adminGroupCount.value > 0 ||
      oversightGroupCount.value > 0,
  );

  async function fetchMe() {
    if (loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const { data } = await UserService.getMe();
      facts.value = data;
    } catch (err) {
      error.value = err;
      facts.value = null;
    } finally {
      loading.value = false;
    }
  }

  /** Fetches once; later callers reuse the answer. */
  async function ensureLoaded() {
    if (!isLoaded.value) await fetchMe();
  }

  return {
    isPlatformAdmin,
    adminGroupCount,
    oversightGroupCount,
    governs,
    loading,
    error,
    isLoaded,
    fetchMe,
    ensureLoaded,
  };
});

import UserService from "@/services/v2/users";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const UI_PERSONAS = Object.freeze({
  PLATFORM_ADMIN: "platform_admin",
  GROUP_ADMIN: "group_admin",
  STANDARD_USER: "standard_user",
});

export const useUIPersonaStore = defineStore("uiPersona", () => {
  const uiPersona = ref(null); // null = unknown

  const isPlatformAdmin = computed(
    () => uiPersona.value === UI_PERSONAS.PLATFORM_ADMIN,
  );
  const isGroupAdmin = computed(
    () => uiPersona.value === UI_PERSONAS.GROUP_ADMIN,
  );
  const isStandardUser = computed(
    () => uiPersona.value === UI_PERSONAS.STANDARD_USER,
  );

  const loading = ref(false);
  const error = ref(null);
  const isLoaded = computed(() => !loading.value && uiPersona.value !== null);

  async function fetchPersona() {
    if (loading.value) return;
    loading.value = true;
    error.value = null;

    try {
      const resp = await UserService.getMe();
      uiPersona.value = resp?.data?.uiPersona;
    } catch (err) {
      error.value = err;
      uiPersona.value = null;
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    fetchPersona();
  });

  return {
    // state
    isGroupAdmin, // boolean
    isPlatformAdmin, // boolean
    isStandardUser, // boolean
    uiPersona, // can be "platform_admin", "group_admin", "standard_user", or null (unknown)

    // constants
    UI_PERSONAS,

    // status
    loading,
    error,
    isLoaded,

    // actions
    fetchPersona,
  };
});

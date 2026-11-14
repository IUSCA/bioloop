import {
  createGlobalState,
  StorageSerializers,
  useLocalStorage,
  useSessionStorage,
} from "@vueuse/core";
import { computed } from "vue";

// Share the same session refs between the auth store, router, and HTTP client.
export const useAuthSession = createGlobalState(() => {
  const normalUser = useLocalStorage("user", {});
  const normalToken = useLocalStorage("token", "");
  const spoofSession = useSessionStorage("auth.spoof", null, {
    serializer: StorageSerializers.object,
    flush: "sync",
    writeDefaults: false,
    // This tab shares one ref. Avoid pausing its writer on its own storage event.
    listenToStorageChanges: false,
  });
  const isSpoofing = computed(() => spoofSession.value !== null);
  const user = computed(() =>
    isSpoofing.value ? spoofSession.value.profile : normalUser.value,
  );
  const token = computed(() =>
    isSpoofing.value ? spoofSession.value.token : normalToken.value,
  );

  function saveSession(data, { spoof = isSpoofing.value } = {}) {
    if (spoof) {
      spoofSession.value = { profile: data.profile, token: data.token };
    } else {
      normalUser.value = data.profile;
      normalToken.value = data.token;
      spoofSession.value = null;
    }
  }

  function clearSession() {
    if (isSpoofing.value) {
      spoofSession.value = null;
    } else {
      normalToken.value = "";
      normalUser.value = {};
    }
  }

  function getSessionSnapshot() {
    return { token: token.value, spoof: isSpoofing.value };
  }

  function isCurrentSession(snapshot) {
    return (
      snapshot?.token === token.value && snapshot?.spoof === isSpoofing.value
    );
  }

  return {
    user,
    token,
    isSpoofing,
    saveSession,
    clearSession,
    getSessionSnapshot,
    isCurrentSession,
  };
});

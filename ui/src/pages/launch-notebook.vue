<template>
  <div
    class="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900"
  >
    <va-card class="w-full max-w-md shadow-lg">
      <va-card-content class="px-8 py-10">
        <!-- App branding -->
        <div class="flex flex-col items-center gap-2 mb-8">
          <AppIcon size="3rem" />
          <AppTitle />
        </div>

        <!-- Loading state -->
        <div v-if="status === 'loading'" class="flex flex-col items-center gap-5">
          <va-progress-circle indeterminate color="primary" size="56px" />
          <div class="text-center">
            <p class="text-lg font-semibold" style="color: var(--va-primary)">
              Launching your notebook
            </p>
            <p class="text-sm mt-1" style="color: var(--va-secondary)">
              {{ stepMessage }}
            </p>
          </div>
        </div>

        <!-- Redirecting state -->
        <div v-else-if="status === 'redirecting'" class="flex flex-col items-center gap-5">
          <va-progress-circle indeterminate color="success" size="56px" />
          <div class="text-center">
            <p class="text-lg font-semibold" style="color: var(--va-success)">
              Notebook is ready
            </p>
            <p class="text-sm mt-1" style="color: var(--va-secondary)">
              Redirecting you now&hellip;
            </p>
          </div>
        </div>

        <!-- Error state -->
        <div v-else-if="status === 'error'" class="flex flex-col items-center gap-5">
          <div
            class="flex items-center justify-center w-14 h-14 rounded-full bg-red-100 dark:bg-red-900"
          >
            <i-mdi-alert-circle-outline
              class="text-4xl text-red-600 dark:text-red-300"
            />
          </div>
          <div class="text-center">
            <p class="text-lg font-semibold text-red-700 dark:text-red-300">
              Could not launch notebook
            </p>
            <p class="text-sm mt-2" style="color: var(--va-secondary)">
              {{ errorMessage }}
            </p>
          </div>
          <va-button color="primary" @click="launch">Try again</va-button>
        </div>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import notebooksService from "@/services/notebooks";

const route = useRoute();

const status = ref("loading"); // 'loading' | 'redirecting' | 'error'
const stepMessage = ref("Starting your notebook server…");
const errorMessage = ref("");

async function launch() {
  status.value = "loading";
  stepMessage.value = "Starting your notebook server…";
  errorMessage.value = "";

  try {
    const nextPath = route.query.next || "";
    const { data } = await notebooksService.launchNotebook(nextPath);
    stepMessage.value = "Almost there — redirecting to your notebook…";
    status.value = "redirecting";
    window.location.href = data.redirect_url;
  } catch (err) {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "An unexpected error occurred. Please try again.";
    errorMessage.value = msg;
    status.value = "error";
  }
}

onMounted(launch);
</script>

<route lang="yaml">
meta:
  title: Launch Notebook
  requiresAuth: true
  layout: auth
</route>

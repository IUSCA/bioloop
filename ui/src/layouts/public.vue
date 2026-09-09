<template>
  <main id="main" class="w-full overflow-y-scroll">
    <div class="min-h-screen" style="background: var(--va-background-primary)">
      <!--
        A brand bar rather than the application header. A reader on this page may have no
        account, so nothing here assumes a session or offers an action that needs one.
      -->
      <header
        class="border-0 border-b border-solid border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      >
        <div
          class="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-4"
        >
          <RouterLink to="/" class="text-base font-semibold">
            {{ config.appTitle }}
          </RouterLink>
          <RouterLink
            to="/auth"
            class="text-sm hover:underline"
            style="color: var(--va-primary)"
          >
            Sign in
          </RouterLink>
        </div>
      </header>

      <div class="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <router-view />
      </div>
    </div>
    <Footer />
  </main>
</template>

<script setup>
import config from "@/config";
</script>

<template>
  <!-- Non-dismissable oversight-only warning banner -->
  <div
    class="flex items-start gap-3 rounded-lg px-4 py-3 border border-solid border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20"
  >
    <i-mdi-eye-outline class="text-xl shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
    <div class="min-w-0">
      <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">
        Oversight visibility only
      </p>
      <p class="text-xs mt-0.5 text-amber-700 dark:text-amber-400">
        You are an ancestor admin of this group. Mutations are disabled — you can view governance
        metadata but cannot make changes to this group directly.
      </p>
    </div>
  </div>
</template>

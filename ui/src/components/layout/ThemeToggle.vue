<template>
  <va-button
    round
    data-testid="theme-toggle"
    @click="toggleDark()"
    preset="primary"
    :color="isDark ? 'warning' : 'primary'"
    :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
  >
    <Icon
      :icon="isDark ? 'material-symbols:light-mode' : 'material-symbols:dark-mode'"
      class="text-xl"
    />
  </va-button>
</template>

<script setup>
const isDark = useDark();
const toggleDark = useToggle(isDark);
</script>

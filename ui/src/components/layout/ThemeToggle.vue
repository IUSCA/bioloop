<template>
  <va-button
    round
    data-testid="theme-toggle"
    :icon="isDark ? 'light_mode' : 'dark_mode'"
    @click="toggleDark()"
    preset="primary"
    :color="isDark ? 'warning' : 'primary'"
  ></va-button>
</template>

<script setup>
const isDark = useDark();
const toggleDark = useToggle(isDark);
</script>

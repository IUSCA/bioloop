<template>
      <va-navbar-item>
        <about/>
      </va-navbar-item>

      <va-navbar-item>
          <profile-dropdown />
      </va-navbar-item>

      <va-navbar-item>
        <dark-mode></dark-mode>
      </va-navbar-item>
</template>

<script setup>
import DarkMode from "./DarkMode.vue";
import About from "./About.vue";
import ProfileDropdown from "./ProfileDropdown.vue";

</script>

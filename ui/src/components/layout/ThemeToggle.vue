<template>
  <!-- <va-switch
    v-model="switchValue"
    :true-value="THEMES.DARK"
    :false-value="THEMES.LIGHT"
    size="small"
  >
    <template #innerLabel>
      <div class="va-text-center">
        <va-icon
          :name="switchValue === THEMES.DARK ? 'dark_mode' : 'light_mode'"
        />
      </div>
    </template>
  </va-switch> -->
  <va-button
    round
    :icon="switchValue === THEMES.DARK ? 'light_mode' : 'dark_mode'"
    @click="toggleValue"
    preset="primary"
    :color="switchValue === THEMES.DARK ? 'warning' : 'primary'"
  ></va-button>
</template>

<script setup>
import { computed } from "vue";
import { useColors } from "vuestic-ui";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const { applyPreset, currentPresetName, colors } = useColors();

const switchValue = computed({
  get() {
    return currentPresetName.value;
  },
  set(value) {
    applyPreset(value);
  },
});

watch(
  [colors, switchValue],
  () => {
    auth.setTheme({
      primary: colors.primary,
      mode: switchValue.value,
    });
  },
  { deep: true }
);

const THEMES = {
  LIGHT: "light",
  DARK: "dark",
};

function toggleValue() {
  switchValue.value =
    switchValue.value === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
}
</script>

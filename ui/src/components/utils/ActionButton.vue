<template>
  <button
    :disabled="disabled"
    @click="$emit('click')"
    :class="{
      'group relative flex flex-col gap-3 rounded-lg border border-solid border-gray-300 dark:border-gray-700 bg-gradient-to-br from-white via-gray-50 to-gray-50 dark:from-gray-900 dark:to-gray-800 p-4 transition-all duration-200 shadow-sm shadow-gray-200/50 dark:shadow-black/20': true,
      'hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md hover:shadow-blue-400/20 dark:hover:shadow-blue-500/10 hover:-translate-y-0.5':
        config.hoverBorderColor === 'blue' && !disabled,
      'hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-md hover:shadow-emerald-400/20 dark:hover:shadow-emerald-500/10 hover:-translate-y-0.5':
        config.hoverBorderColor === 'emerald' && !disabled,
      'hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-md hover:shadow-amber-400/20 dark:hover:shadow-amber-500/10 hover:-translate-y-0.5':
        config.hoverBorderColor === 'amber' && !disabled,
      'opacity-50 cursor-not-allowed': disabled,
    }"
  >
    <!-- Icon -->
    <div :class="`text-2xl ${config.iconColor}`">
      <Icon :icon="config.icon" />
    </div>

    <!-- Content -->
    <div class="text-left">
      <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
        {{ props.title }}
      </h3>
      <p class="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
        {{ props.description }}
      </p>
    </div>

    <!-- Hover overlay effect -->
    <div
      :class="[
        'absolute inset-0 rounded-lg bg-gradient-to-r opacity-0 transition-opacity duration-200',
        config.overlayGradient,
        { 'group-hover:opacity-5': !disabled },
      ]"
    />
  </button>
</template>

<script setup>
const props = defineProps({
  /**
   * Icon name (without 'i-' prefix)
   * @example 'mdi-key', 'mdi-pencil', 'mdi-plus'
   */
  icon: {
    type: String,
    required: true,
  },

  /**
   * Icon color class
   * @example 'text-amber-500', 'text-emerald-500'
   */
  iconColor: {
    type: String,
    required: true,
  },

  /**
   * Button title text
   */
  title: {
    type: String,
    required: true,
  },

  /**
   * Button description text
   */
  description: {
    type: String,
    required: true,
  },

  /**
   * Hover border/shadow color theme
   * Determines which color scheme is used on hover
   * @example 'blue', 'emerald', 'amber'
   */
  hoverTheme: {
    type: String,
    default: "blue",
    validator: (value) => ["blue", "emerald", "amber"].includes(value),
  },

  /**
   * Whether the button is disabled
   */
  disabled: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["click"]);

const config = computed(() => ({
  icon: props.icon,
  iconColor: props.iconColor,
  hoverBorderColor: props.hoverTheme,
  overlayGradient: `from-${props.hoverTheme}-500/0 via-${props.hoverTheme}-500/0 to-${props.hoverTheme}-500/0`,
}));
</script>

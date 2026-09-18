<template>
  <div
    class="grid gap-2 grid-cols-1"
    :class="columnClass"
    role="radiogroup"
    :aria-label="props.label"
  >
    <label
      v-for="option in props.options"
      :key="option.value"
      class="radio-card flex gap-3 p-3 rounded-lg border border-solid cursor-pointer transition items-start"
      :class="
        option.value === props.modelValue
          ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-900/20 hover:border-gray-400 dark:hover:border-gray-500'
      "
    >
      <!--
        Hidden from sight, not from the browser. The card's own border says which option is
        chosen, so the circle is a second answer to the same question. `sr-only` keeps the
        input focusable, arrow-key navigable, and announced, which a `display: none` or a
        div with `role="radio"` would each give up.
      -->
      <input
        type="radio"
        class="sr-only"
        :name="props.name"
        :value="option.value"
        :checked="option.value === props.modelValue"
        @change="emit('update:modelValue', option.value)"
      />
      <!--
        `self-center` rather than the label's `items-start`, so the icon sits against the
        middle of the whole card while the radio stays level with the title.
      -->
      <Icon
        v-if="option.icon"
        :icon="option.icon"
        class="shrink-0 text-3xl self-center"
        :class="
          option.value === props.modelValue
            ? 'text-blue-600 dark:text-blue-300'
            : 'text-gray-500 dark:text-gray-400'
        "
      />
      <div class="min-w-0">
        <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
          {{ option.label }}
        </div>
        <div
          v-if="option.description"
          class="text-xs text-gray-600 dark:text-gray-400 mt-1"
        >
          {{ option.description }}
        </div>
        <slot name="option-extra" :option="option" />
      </div>
    </label>
  </div>
</template>

<script setup>
/**
 * A set of choices as cards, each with an icon, a title, and a line saying what it means.
 *
 * The control is a native `<input type="radio">` inside a `<label>`, so the whole card is a
 * click target and keyboard and screen-reader behaviour is the browser's rather than
 * something reimplemented here.
 *
 * Use it where the choice deserves to be read before it is made — a visibility setting, a
 * placement in a hierarchy. A toggle or a select is the right control where the options are
 * self-explanatory and the space is better spent elsewhere.
 */
const props = defineProps({
  /** The selected option's `value`. */
  modelValue: { type: [String, Number, Boolean, null], default: null },
  /** `{ value, label, description?, icon? }` — `icon` is an mdi name. */
  options: { type: Array, required: true },
  /** Groups the radios for the browser. Must differ from any other group on the page. */
  name: { type: String, required: true },
  /** Names the group for a screen reader, which sees no visible heading. */
  label: { type: String, default: "" },
  /** Columns from the `sm` breakpoint up; one column below it. */
  columns: { type: Number, default: 3 },
});

const emit = defineEmits(["update:modelValue"]);

/**
 * Spelled out rather than interpolated. Tailwind generates a class only when it finds the
 * literal string in the source, so `sm:grid-cols-${n}` compiles to nothing at all.
 */
const COLUMN_CLASSES = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

const columnClass = computed(() => COLUMN_CLASSES[props.columns] ?? "");
</script>

<style scoped>
/*
 * The radio is `sr-only`, so the focus ring the browser would have drawn on it is invisible.
 * The card wears it instead. `:focus-visible` rather than `:focus-within`, so clicking a card
 * with the pointer does not leave a ring behind.
 * @see docs/contributing/v2-design-system.md - Accessibility floor
 */
.radio-card:has(input:focus-visible) {
  outline: 2px solid var(--va-primary);
  outline-offset: 2px;
}
</style>

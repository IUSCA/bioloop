<template>
  <div class="flex flex-col">
    <div v-if="props.showLabel" class="va-title va-text-primary mb-1">
      {{ props.label }}
    </div>
    <va-card :class="[props.showLabel ? 'card--labelled' : 'card--unlabelled']">
      <va-card-content>
        <div class="break-words" v-html="DOMPurify.sanitize(props.html)"></div>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import DOMPurify from "dompurify";

const props = defineProps({
  html: {
    type: String,
    default: "",
  },
  showLabel: {
    type: Boolean,
    default: true,
  },
  label: {
    type: String,
    default: "",
  },
});
</script>

<style scoped>
.va-card {
  overflow: auto;
}

.card--labelled {
  height: 434px;
}

.card--unlabelled {
  height: 418px;
}
</style>

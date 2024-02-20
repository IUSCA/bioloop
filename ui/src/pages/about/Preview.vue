<template>
  <div class="flex flex-col">
    <div v-if="props.showLabel" class="va-title va-text-primary mb-1">
      Preview
    </div>
    <!--    <va-card>-->
    <!--      &lt;!&ndash;    <va-card-title>Preview</va-card-title>&ndash;&gt;-->
    <!--      <va-card-content>-->
    <!--      Test-->
    <div class="break-words" v-html="DOMPurify.sanitize(props.html)"></div>
    <!--      </va-card-content>-->
    <!--    </va-card>-->
  </div>
</template>

<script setup>
import MarkdownIt from "markdown-it";
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
});

// const _html = computed(() => {
//   return DOMPurify.sanitize(props.html);
// });

const md = new MarkdownIt();
// const _text = toRef(() => props.html);
//
// watch(_text, () => {
//   console.log("-------");
//   console.log("_text.value");
//   console.log(_text.value);
// });
</script>

<style scoped>
.va-card {
  height: 434px;
  overflow: auto;
}
</style>

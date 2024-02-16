<template>
  <div class="flex flex-col">
    <div v-if="props.showLabel" class="va-title va-text-primary mb-1">
      Preview
    </div>
    <va-card>
      <!--    <va-card-title>Preview</va-card-title>-->
      <va-card-content>
        <!--      Test-->
        <div class="break-words" v-html="html"></div>
      </va-card-content>
    </va-card>
  </div>
</template>

<script setup>
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const props = defineProps({
  text: {
    type: String,
    default: "",
  },
  showLabel: {
    type: Boolean,
    default: true,
  },
});

const md = new MarkdownIt();
const _text = toRef(() => props.text);

watch(_text, () => {
  console.log("-------");
  console.log("_text.value");
  console.log(_text.value);
});

const html = computed(() => DOMPurify.sanitize(md.render(props.text)));
</script>

<style scoped>
.va-card {
  height: 484px;
  overflow: auto;
}
</style>

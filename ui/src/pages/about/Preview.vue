<template>
  <va-card>
    <!--    <va-card-title>Preview</va-card-title>-->
    <va-card-content>
      <!--      Test-->
      <div class="break-words" v-html="html"></div>
    </va-card-content>
  </va-card>
</template>

<script setup>
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const props = defineProps({
  text: {
    type: String,
    default: "",
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
  height: 500px;
  overflow: auto;
}
</style>

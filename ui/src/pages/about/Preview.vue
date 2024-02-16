<template>
  <va-card>
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

const html = computed(() => DOMPurify.sanitize(md.render(props.text)));
</script>

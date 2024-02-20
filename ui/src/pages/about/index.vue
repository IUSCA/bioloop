<template>
  <div class="grid grid-cols-1 gap-5">
    <div class="banner flex items-end">
      <h1 class="heading_text p-[20px] text-center text-gray-800">Bioloop</h1>
    </div>

    <va-card>
      <va-card-title>
        <div class="flex flex-nowrap items-center w-full">
          <!-- Title -->
          <span class="flex-auto text-lg">About</span>
          <!-- Edit button -->
          <AddEditButton
            class="flex-none"
            edit
            @click="showModal = true"
            v-if="auth.canAdmin"
          />
        </div>
      </va-card-title>
      <!-- Current About text -->
      <va-card-content>
        <va-inner-loading :loading="loading">
          <div v-html="currentAboutHTML"></div>
        </va-inner-loading>
      </va-card-content>
    </va-card>

    <div class="max-h-screen">
      <va-form ref="aboutForm">
        <va-modal
          size="medium"
          title="Edit About"
          v-model="showModal"
          ok-text="Save"
          @ok="submit"
          @before-close="reset"
          no-dismiss
        >
          <div v-if="breakpoint.xs || breakpoint.sm">
            <va-tabs v-model="activeTab">
              <template #tabs>
                <va-tab v-for="tab in [TABS.MARKDOWN, TABS.PREVIEW]" :key="tab">
                  {{ tab }}
                </va-tab>
              </template>
            </va-tabs>

            <Edit
              v-model="markdownInput"
              v-if="activeTab === 0"
              :show-label="false"
            />
            <Preview :html="updatedAboutHTML" v-else :show-label="false" />
          </div>

          <div class="flex gap-2" v-else>
            <Edit class="flex-1" v-model="markdownInput" />
            <va-divider vertical />
            <Preview class="flex-1" :html="updatedAboutHTML" />
          </div>
        </va-modal>
      </va-form>
    </div>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
import aboutService from "@/services/about";
import MarkdownIt from "markdown-it";
import { useForm } from "vuestic-ui";
import DOMPurify from "dompurify";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import { htmlDecode } from "@/services/utils";
import Edit from "@/pages/about/Edit.vue";
import Preview from "@/pages/about/Preview.vue";
import { useBreakpoint } from "vuestic-ui";
import TurndownService from "turndown";

const turndownService = new TurndownService({
  blankReplacement: false,
});
// turndownService.keep("<br>");

// const MODES = { DESKTOP: "desktop", MOBILE: "mobile" };
// const mode = ref(MODES.DESKTOP);

const breakpoint = useBreakpoint();
const md = new MarkdownIt();
//   {
// html: true,
// xhtmlOut: true,
// }
const nav = useNavStore();
nav.setNavItems([], false);
const TABS = { MARKDOWN: "Markdown", PREVIEW: "Preview" };
const activeTab = ref(0);

const auth = useAuthStore();

const { validate } = useForm("aboutForm");

const showModal = ref(false);

const markdownInput = ref("");
const currentAboutHTML = ref("");
const updatedAboutHTML = computed(() => {
  console.log(`updatedAboutHTML computed:`);
  const renderedHTML = md.render(markdownInput.value);
  console.log(`markdownInput.value`);
  console.log(markdownInput.value);
  console.log(`md.render(markdownInput.value)`);
  console.log(renderedHTML);
  return DOMPurify.sanitize(renderedHTML);
});

const latestRecord = ref({});
const loading = ref(false);

const submit = () => {
  if (!validate()) {
    return;
  }

  loading.value = true;
  aboutService
    .createOrUpdate({
      ...(latestRecord.value && { id: latestRecord.value.id }),
      data: { html: updatedAboutHTML.value },
    })
    .then((res) => {
      latestRecord.value = res.data;
      showModal.value = false;
      toast.success("Updated About!");
    })
    .catch(() => {
      toast.error("Failed to update About");
    })
    .finally(() => {
      loading.value = false;
    });
};

const reset = () => {
  updatedAboutHTML.value = DOMPurify.sanitize(currentAboutHTML.value);
};

onMounted(() => {
  loading.value = true;
  aboutService
    .getLatest()
    .then((res) => {
      latestRecord.value = res.data;
    })
    .catch(() => {
      toast.error("Failed to fetch About");
    })
    .finally(() => {
      loading.value = false;
    });
});

watch(latestRecord, () => {
  console.log("WATCH");
  console.log(`latestRecord.value?.html`);
  console.log(latestRecord.value?.html);

  currentAboutHTML.value = DOMPurify.sanitize(latestRecord.value?.html);
  // debugger;

  console.log(`currentAboutHTML.value`);
  console.log(currentAboutHTML.value);

  markdownInput.value = turndownService.turndown(currentAboutHTML.value || "");

  console.log(`markdownInput.value`);
  console.log(markdownInput.value);
  console.log(`--------`);
});
</script>

<style scoped>
div.banner {
  height: 250px;
  background-image: linear-gradient(
      rgba(0, 0, 0, 0.3),
      rgba(255, 255, 255, 0.6)
    ),
    url("/colorful_helix.jpg");
  background-position: 30% 60%;
}
div.banner h1.heading_text {
  background-color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}
</style>

<route lang="yaml">
meta:
  title: About
  requiresAuth: false
</route>

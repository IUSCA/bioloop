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
      <va-card-content class="preview">
        <va-inner-loading :loading="loading">
          <div v-html="currentAboutHTML"></div>
        </va-inner-loading>
      </va-card-content>
    </va-card>

    <div class="max-h-screen">
      <va-form ref="aboutForm">
        <!-- Editor / Preview container modal -->
        <va-modal
          ref="editAboutModal"
          size="medium"
          title="Edit About"
          v-model="showModal"
          hide-default-actions
          no-dismiss
        >
          <template #footer>
            <div class="flex gap-2">
              <va-button
                preset="secondary"
                @click="onCancel"
                :disabled="loading"
                >Cancel</va-button
              >
              <va-button @click="onSubmit" :disabled="!isValid || loading"
                >Save</va-button
              >
            </div>
          </template>

          <!-- Editor / Preview -->
          <va-inner-loading :loading="loading">
            <!-- Mobile view -->
            <div v-if="ui.isMobileView">
              <va-tabs v-model="activeTab">
                <template #tabs>
                  <va-tab
                    v-for="tab in [TABS.UPDATED_MARKDOWN, TABS.PREVIEW]"
                    :key="tab"
                  >
                    {{ tab }}
                  </va-tab>
                </template>
              </va-tabs>

              <Edit
                v-model="markdownInput"
                v-if="activeTab === 0"
                :show-label="false"
                :label="TABS.UPDATED_MARKDOWN"
              />
              <Preview
                class="preview"
                :html="updatedAboutHTML"
                v-else
                :show-label="false"
                :label="TABS.PREVIEW"
              />
            </div>

            <!-- Desktop view -->
            <div class="flex gap-2" v-else>
              <Edit
                class="flex-1"
                v-model="markdownInput"
                :label="TABS.UPDATED_MARKDOWN"
              />
              <va-divider vertical />
              <Preview
                class="flex-1 preview"
                :html="updatedAboutHTML"
                :label="TABS.PREVIEW"
              />
            </div>
          </va-inner-loading>
        </va-modal>
      </va-form>
    </div>
  </div>
</template>

<script setup>
import { useNavStore } from "@/stores/nav";
import aboutService from "@/services/about";
import markdownit from "markdown-it";
import { useForm } from "vuestic-ui";
import DOMPurify from "dompurify";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import Edit from "@/pages/about/Edit.vue";
import Preview from "@/pages/about/Preview.vue";
import TurndownService from "turndown";
import { useUIStore } from "@/stores/ui";

const nav = useNavStore();
// const breakpoint = useBreakpoint();
const ui = useUIStore();
const auth = useAuthStore();

nav.setNavItems([], false);

const turndownService = new TurndownService();
turndownService.addRule("lineBreak", {
  filter: ["br"],
  replacement: function () {
    return "<br>";
  },
});

const md = markdownit("commonmark", {
  html: true,
  linkify: true,
  typographer: true,
});

const TABS = { UPDATED_MARKDOWN: "Updated Markdown", PREVIEW: "Preview" };
const activeTab = ref(0);

const { validate, isValid } = useForm("aboutForm");

const showModal = ref(false);
const editAboutModal = ref(null);

const markdownInput = ref("");

const currentAboutHTML = ref("");
const updatedAboutHTML = computed(() => {
  // console.log("---------------");
  // console.log(`updatedAboutHTML COMPUTED:`);
  // const renderedHTML = md.render("<p>a<br>\n" + "<br>\n" + "b</p>");
  const renderedHTML = md.render(markdownInput.value);

  // console.log(`md.render(markdownInput.value)`);
  // console.log(renderedHTML);
  const sanitizedHTML = DOMPurify.sanitize(renderedHTML);
  // console.log(`sanitizedHTML:`);
  // console.log(sanitizedHTML);
  return sanitizedHTML;
});

const latestRecord = ref({});
const loading = ref(false);

const onCancel = () => {
  editAboutModal.value.hide();
  reset();
};

const onSubmit = () => {
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
      editAboutModal.value.hide();
    });
};

const reset = () => {
  markdownInput.value = turndownService.turndown(currentAboutHTML.value || "");
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
  // console.log("WATCH");
  currentAboutHTML.value = DOMPurify.sanitize(latestRecord.value?.html);

  // console.log(`currentAboutHTML.value`);
  // console.log(currentAboutHTML.value);

  markdownInput.value = turndownService.turndown(currentAboutHTML.value || "");
  // console.log(`markdownInput.value`);
  // console.log(markdownInput.value);
  // console.log(`--------`);
});
</script>

<style lang="scss" scoped>
.preview {
  :deep(ul) {
    list-style: inside;
  }

  :deep(ol) {
    list-style: inside decimal;
  }

  :deep(li ul) {
    padding-left: 15px;
  }

  :deep(li ol) {
    padding-left: 15px;
  }

  :deep(blockquote) {
    border-left: 0.25rem solid var(--va-primary);
    border-radius: 0.125rem;
    color: var(--va-secondary);
    padding: 0.4rem 0 0.4rem 0.8rem;
  }

  :deep(code) {
    color: var(--va-secondary);
    font-family: var(--va-font-family);
  }
}

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

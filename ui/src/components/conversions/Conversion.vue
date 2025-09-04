<template>
  <va-collapse v-model="collapseState" solid v-if="props.conversion">
    <template #header="{ value, attrs, iconAttrs }">
      <div
        v-bind="attrs"
        class="w-full flex border-[var(--va-background-border)] border-solid border-2 p-2 pl-0 bg-[var(--va-background-element)]"
      >
        <!-- collapse icon -->
        <div class="flex-none mr-2">
                  <va-icon
          name="va-arrow-down"
          :class="value ? '' : 'rotate-[-90deg]'"
          v-bind="iconAttrs"
        />
        </div>

        <!-- info -->
        <div class="flex gap-3 justify-between">
          <!-- definition, program, args list -->
          <div class="space-y-1 w-[500px]">
            <div class="flex items-center">
              <!-- definition -->
              <div class="font-bold spacing-wide">
                {{ props.conversion.definition.name }}
              </div>

              <!-- program -->
              <div class="flex items-center gap-1 ml-5">
                <i-mdi-console class="" />
                <span class="">
                  {{ props.conversion.definition.program.name }}
                </span>
              </div>
            </div>

            <div class="text-sm flex gap-1 flex-wrap items-center">
              <span class="font-semibold"> Arguments: </span>
              <va-chip
                v-for="(arg, idx) in props.conversion.args_list"
                :key="idx"
                size="small"
                square
                color="secondary"
                :title="arg"
              >
                <div class="max-w-[200px] truncate">{{ arg }}</div>
              </va-chip>
            </div>
          </div>

          <!-- workflow id and status -->
          <div class="space-y-1 flex flex-col justify-center">
            <div class="flex gap-1 items-center">
              <WorkflowStatusIcon
                :status="props.conversion?.workflow?.status"
                class="text-xl"
              />
              <div class="font-semibold">
                {{ props.conversion?.workflow?.status }}
              </div>
            </div>
            <div class="flex items-center gap-1">
              <i-mdi-map-marker-path class="text-base" />
              <RouterLink :to="{ hash: `#${props.conversion.workflow_id}` }">
                <span class="text-sm">
                  {{ props.conversion.workflow_id }}
                </span>
              </RouterLink>
            </div>
          </div>

          <!-- initiated at -->
          <div class="flex flex-col justify-center gap-1">
            <div class="flex items-center pl-1">
              <va-popover message="Created On" :hover-over-timeout="500">
                <i-mdi-calendar
                  class="text-xl inline-block text-slate-700 dark:text-slate-300"
                />
              </va-popover>
              <span class="hidden md:inline pl-2 lg:spacing-wider lg:text-base">
                {{ datetime.absolute(props.conversion.initiated_at) }}
              </span>
              <span
                class="md:hidden pl-2 lg:spacing-wider text-sm lg:text-base"
              >
                {{ datetime.date(props.conversion.initiated_at) }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <UserAvatar v-bind="props.conversion.initiator" />
              <span> {{ props.conversion.initiator.username }} </span>
            </div>
          </div>

          <!-- actions: re-run, delete -->
          <div class="flex flex-col items-center gap-2">
            <va-popover message="Not yet implemented">
              <va-button
                size="small"
                preset="secondary"
                @click="emit('rerun')"
                disabled
              >
                <div class="flex items-center">
                  <i-mdi-replay class="text-lg" />
                  <span>Re-run</span>
                </div>
              </va-button>
            </va-popover>

            <va-popover message="Not yet implemented">
              <va-button
                size="small"
                preset="secondary"
                color="danger"
                @click="emit('delete')"
                disabled
              >
                <div class="flex items-center">
                  <i-mdi-delete class="text-lg" />
                  <span>Delete</span>
                </div>
              </va-button>
            </va-popover>
          </div>
        </div>
      </div>
    </template>

    <template #body>
      <div
        class="p-2 border-[var(--va-background-border)] border-solid border-2 border-t-0"
      >
        <div class="space-y-2">
          <div class="">
            {{ props.conversion.definition.description }}
          </div>

          <!-- output and log directories -->
          <div
            class="flex gap-2 items-center w-full"
            v-if="props.conversion.definition.output_directory"
          >
            <i-mdi-folder class="text-lg" />
            <span class="font-semibold flex-none"> Output Directory : </span>

            <CopyText
              :text="props.conversion.definition.output_directory"
              class="w-96"
            />
          </div>

          <div
            class="flex gap-2 items-center w-full"
            v-if="props.conversion.definition.logs_directory"
          >
            <i-mdi-file-document class="text-lg" />
            <span class="font-semibold"> Logs Directory : </span>

            <CopyText
              :text="props.conversion.definition.logs_directory"
              class="w-96"
            />
          </div>
        </div>
      </div>
    </template>
  </va-collapse>
</template>

<script setup>
import * as datetime from "@/services/datetime";
import CopyText from "../utils/CopyText.vue";

const props = defineProps({
  conversion: Object,
});

const collapseState = ref(false);

const emit = defineEmits(["delete", "rerun", "openWorkflow"]);
</script>

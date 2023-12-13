<template>
  <div class="va-table-responsive">
    <table class="va-table">
      <tbody>
        <tr>
          <td>ID</td>
          <td>{{ props.project.id }}</td>
        </tr>
        <tr>
          <td>Name</td>
          <td>{{ props.project.name }}</td>
        </tr>
        <tr>
          <td>Alias</td>
          <td>
            <span>
              {{ props.project.slug }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Created Date</td>
          <td>
            <span class="spacing-wider">
              {{ datetime.absolute(props.project.created_at) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Last Updated</td>
          <td>
            <span class="spacing-wider">
              {{ datetime.absolute(props.project.updated_at) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Storage Allocation</td>
          <td>
            <span class="spacing-wider">
              {{ formatBytes(project_space_occupied) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Description</td>
          <td>
            <!-- 
              Fraction height of 11.5rem is crucial. It cuts off the last line when the text overflows
              This is a visual cue to the user indicating that the entire text is not visible 
              and prompting them to scroll further. Mac browsers will not show scroll bar unless scrolled
            -->
            <div class="max-h-[11.5rem] overflow-y-scroll">
              {{ props.project.description }}
            </div>
          </td>
        </tr>
        <tr>
          <td>Funding</td>
          <td>{{ props.project.funding }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { formatBytes } from "@/services/utils";
const props = defineProps({ project: Object });

const project_space_occupied = computed(() => {
  return (props.project?.datasets || []).reduce(
    (acc, curr) => acc + (parseInt(curr?.dataset?.size) || 0),
    0,
  );
});
</script>

<style lang="scss" scoped>
div.va-table-responsive {
  overflow: auto;

  // first column min width
  td:first-child {
    min-width: 135px;
  }
}
</style>

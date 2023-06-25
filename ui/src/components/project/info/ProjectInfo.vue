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
            {{ datetime.absolute(props.project.created_at) }}
          </td>
        </tr>
        <tr>
          <td>Last Updated</td>
          <td>
            <span class="">
              {{ datetime.absolute(props.project.updated_at) }}
            </span>
          </td>
        </tr>
        <tr>
          <td>Genome Browser</td>
          <td>
            <BinaryStatusChip :status="props.project.browser_enabled" />
          </td>
        </tr>
        <tr>
          <td>Description</td>
          <td>
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
const props = defineProps({ project: Object });
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

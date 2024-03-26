<template>
  <va-alert :color="alertColor" class="mb-3">
    {{ alertText }}
  </va-alert>
  <!--  <va-card>-->
  <!--    <va-card-content>-->

  <div class="va-table-responsive">
    <table class="va-table">
      <tbody>
        <tr>
          <td>Number of files in original dataset</td>
          <td>
            <va-chip size="small" outline>{{
              props.original_files_count
            }}</va-chip>
          </td>
        </tr>
        <tr>
          <td>Number of files in incoming duplicate dataset</td>
          <td>
            <va-chip size="small" outline>{{
              props.duplicate_files_count
            }}</va-chip>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
const props = defineProps({
  original_files_count: { type: Number, required: true },
  duplicate_files_count: { type: Number, required: true },
});

const alertColor = computed(() => {
  return props.original_files_count === props.duplicate_files_count
    ? "success"
    : "warning";
});

const alertText = computed(() => {
  return props.original_files_count === props.duplicate_files_count
    ? "Number of files in original dataset and incoming duplicate match"
    : "Number of files in original dataset and incoming duplicate do not match";
});
</script>

<style scoped></style>

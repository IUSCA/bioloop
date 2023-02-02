<template>
  <span>Run page - {{ props.batchId }}</span>
</template>

<script setup>
const props = defineProps({ batchId: String });

const batch = ref({
  id: 7,
  name: "bcl_fastq",
  num_directories: 976,
  num_files: 4249,
  num_genome_files: 636,
  du_size: "87839405520",
  size: "87835338192",
  description: null,
  created_at: "2023-02-02T21:16:37.772Z",
  updated_at: "2023-02-02T22:23:53.628Z",
  origin_path: "/N/project/DG_Multiple_Myeloma/share/bcl_fastq",
  archive_path: "archive/2023/bcl_fastq.tar",
  stage_path: "/N/scratch/dgluser/test/stage/bcl_fastq",
  workflow_id: "63339ae0-9643-4d8b-aa3a-303434f6bdcd",
  workflow: {
    created_at: "2023-02-02T21:16:37.732000",
    id: "63339ae0-9643-4d8b-aa3a-303434f6bdcd",
    status: "SUCCESS",
    steps: [
      {
        name: "inspect",
        status: "SUCCESS",
        task: "scaworkers.workers.inspect.inspect_batch",
      },
      {
        name: "archive",
        status: "SUCCESS",
        task: "scaworkers.workers.archive.archive_batch",
      },
      {
        name: "stage",
        status: "SUCCESS",
        task: "scaworkers.workers.stage.stage_batch",
      },
      {
        name: "validate",
        status: "SUCCESS",
        task: "scaworkers.workers.validate.validate_batch",
      },
    ],
    steps_done: 4,
    total_steps: 4,
    updated_at: "2023-02-02T21:16:37.732000",
  },
});
</script>

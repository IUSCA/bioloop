<template>
  <ConversionDefinitionSelect v-model="definition" class="w-full" />

  <div v-if="definition" class="mt-3">
    <div class="space-y-2 pl-3">
      <!-- description -->
      <div>
        <span class="va-text-secondary">
          {{ definition.description }}
        </span>
      </div>

      <!-- output and log directories -->
      <div v-if="definition.output_directory">
        <span class=""> Output Directory : </span>
        <span class="truncate">
          {{ definition.output_directory }}
        </span>
      </div>

      <div v-if="definition.logs_directory">
        <span class=""> Logs Directory : </span>
        <span class="truncate">
          {{ definition.logs_directory }}
        </span>
      </div>

      <div class="flex">
        <!-- dataset types -->
        <div>
          <!-- <span class="font-semibold mr-2"> Runs on </span> -->
          <va-chip
            v-for="dt in definition.dataset_types"
            :key="dt"
            size="small"
            square
          >
            <span class="uppercase"> {{ dt }} </span>
          </va-chip>
        </div>

        <!-- tags -->
        <div class="flex gap-2 items-center ml-auto">
          <!-- <span class="font-semibold mr-2"> Tags </span> -->
          <va-chip
            v-for="tag in definition.tags"
            :key="tag"
            size="small"
            color="info"
          >
            <span class="uppercase"> {{ tag }} </span>
          </va-chip>
        </div>
      </div>
    </div>

    <!-- Program -->
    <va-card class="mt-5">
      <va-card-content>
        <ConversionProgramForm
          :program="definition.program"
          v-model:argValues="argValues"
        />
      </va-card-content>
    </va-card>
  </div>

  <div v-else>
    <div class="flex flex-col justify-center items-center h-40">
      <span class="text-gray-500">
        Select a conversion definition to see associated program and arguments.
      </span>
    </div>
  </div>
</template>

<script setup>
const definition = defineModel("definition");
const argValues = defineModel("argValues");
</script>

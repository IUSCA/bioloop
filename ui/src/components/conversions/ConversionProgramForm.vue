<template>
  <div>
    <!-- program -->
    <span class="text-lg">
      <span class="font-semibold"> Program : </span>
      {{ props.program.name }}
    </span>

    <!-- Show arguments -->
    <div v-if="model.length" class="flex flex-col gap-3 mt-5">
      <div
        v-for="(argument, idx) in props.program.arguments"
        :key="argument.id"
      >
        <Argument
          :argument="argument"
          :modelValue="model[idx].value"
          @update:modelValue="(v) => (model[idx].value = v)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
const model = defineModel();
const props = defineProps({
  program: {
    type: Object,
    required: true,
  },
});

onMounted(() => {
  model.value = props.program.arguments.map((arg) => ({
    argument_id: arg.id,
    value: arg.dynamic_variable_name || arg.default_value,
  }));
});
</script>

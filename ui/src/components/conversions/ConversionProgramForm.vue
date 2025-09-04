<template>
  <div>
    <!-- program -->
    <span class="text-lg">
      <span class="font-semibold"> Program : </span>
      {{ props.program.name }}
    </span>

    <!-- Show arguments -->
    <div v-if="model.argument_values?.length" class="flex flex-col gap-3 mt-5">
      <div
        v-for="(argument, idx) in props.program.arguments"
        :key="argument.id"
      >
        <Argument
          :argument="argument"
          :modelValue="model.argument_values[idx].value"
          @update:modelValue="(v) => (model.argument_values[idx].value = v)"
        />
      </div>
    </div>

    <!-- Additional arguments input -->
    <div v-if="props.program.allow_additional_args" class="flex items-center gap-3 mt-5">
      <label class="">
        <div class="flex flex-col w-[200px]">
          <span class="font-semibold">
            Additional Arguments
          </span>
          <span class="text-sm text-gray-500 mt-[-3px] truncate">
            Any additional arguments will be passed to the program as typed.
          </span>
        </div>
      </label>
          
      <div class="flex-1">
        <va-input
          v-model="additionalArgs"
          placeholder="--no-lane-splitting --barcode-mismatches 1"
          preset="bordered"
          class="w-full"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
const model = defineModel("argValues");

const additionalArgs = ref('');

const props = defineProps({
  program: {
    type: Object,
    required: true,
  },
});

onMounted(() => {
  // Initialize with the new structure
  model.value = {
    argument_values: props.program.arguments.map((arg) => ({
      argument_id: arg.id,
      value: arg.dynamic_variable_name || arg.default_value,
    })),
    user_argument_values: [],
  };
});

// Watch for changes in additionalArgs and update the model
watch(additionalArgs, (newValue) => {
  if (!model.value) return;
  
  if (newValue.trim()) {
    // Split the additional args string into an array
    const argsArray = newValue.trim().split(/\s+/).filter(arg => arg.trim());
    model.value.user_argument_values = argsArray.map(arg => {
      // Handle both --flag and --key=value formats
      if (arg.includes('=')) {
        const [name, value] = arg.split('=', 2);
        return { argument_name: name, value: value };
      } else {
        return { argument_name: arg, value: true };
      }
    });
  } else {
    model.value.user_argument_values = [];
  }
});
</script>

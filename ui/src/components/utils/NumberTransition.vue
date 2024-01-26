<template>
  <span>
    {{ current.toFixed(0) }}
  </span>
</template>

<script setup>
/*
 * Shows a number that transitions from the current value to the target value.
 * The transition is debounced to avoid unnecessary updates.
 * Props: target, duration, iterations, debounce
 * target: the target value
 * duration: the duration of the transition of each iteration in ms
 * iterations: the number of iterations to move from the current value to the target value
 * debounce: the debounce time in ms for props.target
 *
 * Example: <NumberTransition :target="100" :duration="50" :iterations="10" />
 *
 */
const props = defineProps({
  target: {
    type: Number,
    required: true,
  },
  duration: {
    type: Number,
    default: 50,
  },
  iterations: {
    type: Number,
    default: 10,
  },
  debounce: {
    type: Number,
    default: 300,
  },
});

const current = ref(0);

debouncedWatch(
  () => props.target,
  (_target) => {
    const target = Number(_target) || 0;
    const diff = target - current.value;
    let step = diff / props.iterations;

    let count = 0;
    const { pause } = useIntervalFn(() => {
      count += 1;
      current.value = current.value + step;
      if (count >= props.iterations) {
        pause();
        current.value = target;
      }
    }, props.duration);
  },
  { debounce: props.debounce },
);
</script>

<style scoped>
.number-transition {
  transition: all 0.5s;
}
</style>
```
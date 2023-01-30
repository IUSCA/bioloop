<template>
  <!-- https://steemit.com/utopian-io/@alfarisi94/how-to-make-step-progress-component-in-vue-js -->
  <!-- <span>step progress: {{ props.steps }}</span> -->
  <div class="root">
    <div class="container">
      <ul class="progressbar">
        <li
          v-for="step in props.steps"
          :key="step.name"
          :class="step.completed ? 'active' : ''"
        >
          {{ step.name }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  steps: Array,
});
</script>

<style scoped>
.container {
  width: 80%;
  position: absolute;
  z-index: 1;
}
.progressbar li {
  float: left;
  width: 20%;
  position: relative;
  text-align: center;
}

.progressbar {
  counter-reset: step;
}
.progressbar li:before {
  content: counter(step);
  counter-increment: step;
  width: 30px;
  height: 30px;
  border: 2px solid #bebebe;
  display: block;
  margin: 0 auto 10px auto;
  border-radius: 50%;
  line-height: 27px;
  background: white;
  color: #bebebe;
  text-align: center;
  font-weight: bold;
}

.progressbar li:after {
  content: "";
  position: absolute;
  width: 100%;
  height: 3px;
  background: #979797;
  top: 15px;
  left: -50%;
  z-index: -1;
}

.progressbar li.active:before {
  border-color: #3aac5d;
  background: #3aac5d;
  color: white;
}
.progressbar li.active:after {
  background: #3aac5d;
}
.progressbar li.active + li:after {
  background: #3aac5d;
}
.progressbar li.active + li:before {
  border-color: #3aac5d;
  background: #3aac5d;
  color: white;
}
.progressbar li:first-child:after {
  content: none;
}
</style>

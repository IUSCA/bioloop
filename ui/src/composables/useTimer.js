import { ref, onMounted, onUnmounted } from "vue";
import * as datetime from "@/services/datetime";

export default function useTimer(start_time) {
  // start_time is a ISO 8601 string in UTC time zone (with Z)
  const start = new Date(start_time);
  const elapsed_time = ref(0);

  let timer_id;

  const startTimer = () => {
    timer_id = setInterval(() => {
      const now = new Date();
      const elapsed_ms = now - start;
      elapsed_time.value = datetime.formatDuration(elapsed_ms);
    }, 1000);
  };

  const stopTimer = () => {
    clearInterval(timer_id);
  };

  onMounted(() => {
    startTimer();
  });

  onUnmounted(() => {
    stopTimer();
  });

  return elapsed_time;
}

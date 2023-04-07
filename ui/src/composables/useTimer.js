import { ref, onMounted, onUnmounted } from "vue";
import moment from "moment";
import { format_duration } from "@/services/utils";

export default function useTimer(start_time) {
  console.log(start_time);
  const elapsed_time = ref(0);

  let timer_id;

  const startTimer = () => {
    timer_id = setInterval(() => {
      const now = moment.utc();
      const duration = moment.duration(now - moment.utc(start_time));
      elapsed_time.value = format_duration(duration);
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

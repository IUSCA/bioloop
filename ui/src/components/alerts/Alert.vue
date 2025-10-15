<template>
  <div
    class="flex items-center justify-center gap-3 px-4 py-2 w-full"
    :class="getAlertClasses(props.alert.type)"
  >
    <!-- Alert Icon -->
    <va-icon
      :name="alertService.getAlertIcon(props.alert.type)"
      :color="alertService.getIconColor(props.alert.type)"
      size="1.25rem"
    />

    <!-- Alert Message -->
    <div 
      class="flex-1 text-center"
      v-html="renderedMessage"
    ></div>

    <!-- Alert created-at -->
    <div class="text-sm va-text-secondary">
      {{ datetime.displayDateTime(props.alert.created_at) }}
    </div>

    <!-- Close Button -->
    <va-button
      v-if="props.dismissable"
      preset="plain"
      size="small"
      icon="close"
      @click="handleClose"
      class="flex-shrink-0"
    />
  </div>
</template>

<script setup>
import alertService from "@/services/alert";
import * as datetime from "@/services/datetime";
import DOMPurify from "dompurify";

const props = defineProps({
  alert: {
    type: Object,
    required: true,
  },
  dismissable: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["close"]);

// Get dark mode state
const isDark = useDark();

// Configure rendered message to style hyperlinks and mailto elements.
const renderedMessage = computed(() => {
  if (!props.alert.message) return "";
  
  let processed = props.alert.message;
  
  // Convert URLs into clickable links
  processed = processed.replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="alert-link">$1</a>'
  );

  // Convert email addresses into mailto links
  processed = processed.replace(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    '<a href="mailto:$1" class="alert-link">$1</a>'
  );
    
  // Sanitize to prevent XSS
  return DOMPurify.sanitize(processed, {
    ALLOWED_TAGS: ['a'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class']
  });
});

const handleClose = () => {
  emit("close");
};

const getAlertClasses = (type) => {
  const getTypeStyles = ({lightBg, darkBg, lightText, darkText, borderColor}) => {
    const bg = isDark.value ? darkBg : lightBg;
    const text = isDark.value ? darkText : lightText;
    return `${bg} ${text} border-l-4 ${borderColor}`;
  };

  switch (type) {
    case "ERROR":
      return getTypeStyles({lightBg: "bg-red-50", darkBg: "bg-red-950", lightText: "text-red-800", darkText: "text-red-200", borderColor: "border-red-500"});
    case "WARNING":
      return getTypeStyles({lightBg: "bg-amber-50", darkBg: "bg-amber-950", lightText: "text-amber-800", darkText: "text-amber-200", borderColor: "border-amber-500"});
    case "INFO":
      return getTypeStyles({lightBg: "bg-blue-50", darkBg: "bg-blue-950", lightText: "text-blue-800", darkText: "text-blue-200", borderColor: "border-blue-500"});
    default:
      return getTypeStyles({lightBg: "bg-blue-50", darkBg: "bg-blue-950", lightText: "text-blue-800", darkText: "text-blue-200", borderColor: "border-blue-500"});
  }
};
</script>

<style scoped>
/* Custom link styling for better contrast in alerts */
:deep(.alert-link) {
  text-decoration: underline;
  font-weight: 500;
  transition: opacity 0.2s ease;
}

:deep(.alert-link:hover) {
  opacity: 0.7;
}

/* INFO alerts: in light mode, use darker color for better contrast */
.text-blue-800 :deep(.alert-link) {
   color: #1e40af; /* blue-800 - darker than the text */
}

/* INFO alerts: in dark mode, use lighter color for better contrast */
.text-blue-200 :deep(.alert-link) {
  color: #93c5fd; /* blue-300 - lighter in dark mode */
}

/* ERROR alerts: in light mode, use darker color for better contrast */
.text-red-800 :deep(.alert-link) {
  color: #dc2626; /* red-600 */
}

/* ERROR alerts: in dark mode, use lighter color for better contrast */
.text-red-200 :deep(.alert-link) {
  color: #fca5a5; /* red-300 */
}

/* WARNING alerts: in light mode, use darker color for better contrast */
.text-amber-800 :deep(.alert-link) {
  color: #d97706; /* amber-600 */
}

/* WARNING alerts: in dark mode, use lighter color for better contrast */
.text-amber-200 :deep(.alert-link) {
  color: #fcd34d; /* amber-300 */
}
</style>

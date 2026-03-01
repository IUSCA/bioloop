# UI Coding Standards

- Use tailwind css classes over css styles whenever possible.
- If using a tailwind color class also add a complementary dark color ex: text-red-700 dark:text-red-300.
- For icons, use material design icons. ex: <i-mdi-alert class="" /> or <Icon icon="mdi-alert" class="text-2xl"/>
- Use tailwind classes for layout, spacing, and typography.
- Use Vuestic UI components where applicable, like `<VaButton>`, `<VaInput>`, `<VaSelect>`, etc. Use Vuestic UI's built-in props for colors, sizes, and variants instead of custom styles. 
- Ensure to use Vuestic UI's color system for consistency
- Use these standard colors to keep in line with theme  
  --va-muted: #7f828b;
  --va-primary: #154ec1;
  --va-secondary: #767c88;
  --va-success: #3d9209;
  --va-info: #158de3;
  --va-danger: #e42222;
  --va-warning: #ffd43a;
ex on how to use Vuestic UI colors and components in Vue.js:
  ```html
  <template>
    <!-- use javascript object -->
    <div :style="color: {{ colorByStatus }}"></div>
  
    <!-- use css variables -->
    <span style="color: var(--va-warning)"> </span>
  
    <!-- using style block -->
    <p class="title">
      Title
    </p>
  
    <!-- use builtin props -->
    <va-button color="info"></va-button>
  </template>
  
  <script setup>
    import { useColors } from "vuestic-ui";
    const colors = useColors()
  
    const colorByStatus = status == 'FAILED' ? colors.danger : color.primary
  </script>
  
  <style scoped>
  .title {
    color: var(--va-primary)
  }
  </style>
  ```

Conventions:
- Use CamelCase for custom and Vuestic component names. ex: `<VaButton>`, `<UserProfile>`.
- vue and vueuse composable need not be explicitly imported in script setup. unplugin-auto-import/vite takes care of that.
- User defined components need to be explicitly imported. unplugin-vue-components/vite takes care of auto registering  components.
- always qualify props with `props.` in template section to improve readability.
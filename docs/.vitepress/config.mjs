import { defineConfig } from 'vitepress';
import { withMermaid } from "vitepress-plugin-mermaid";
import { withSidebar } from 'vitepress-sidebar';

// https://vitepress.dev/reference/site-config
let vitePressOptions =  {
  title: "Bioloop",
  base: "/bioloop/",
  description: "Bioloop Documentation",
  head: [['link', { rel: 'icon', href: '/bioloop/docs/favicon.ico' }]],
  lastUpdated: true, // Enable last updated timestamp
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'UI', link: '/ui/overview' },
      { text: 'API', link: '/api/introduction' },
      { text: 'Workers', link: '/worker/overview' },

    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/IUSCA/bioloop' }
    ],

    search: {
      provider: 'local'
    },

    editLink: {
      pattern: 'https://github.com/IUSCA/bioloop/edit/main/docs/:path'
    }
  },
  ignoreDeadLinks: [
    // ignore exact url "/playground"
    '/playground',
    // ignore all localhost links
    /^https?:\/\/localhost/,
    // ignore all links include "/repl/""
    /\/repl\//,
    // custom function, ignore all links include "ignore"
    (url) => {
      return url.toLowerCase().includes('ignore')
    }
  ]
};

vitePressOptions = withMermaid({
  ...vitePressOptions,
  mermaid: {
    // refer https://mermaid.js.org/config/setup/modules/mermaidAPI.html#mermaidapi-configuration-defaults for options
  },
  // optionally set additional config for plugin itself with MermaidPluginConfig
  mermaidPlugin: {
    class: "mermaid my-class", // set additional css classes for parent container 
  },
})


const vitePressSidebarOptions = {
  // VitePress Sidebar's options here...
  documentRootPath: '/docs',
  collapsed: true,
  capitalizeFirst: true,
  includeFolderIndexFile: false,
  useTitleFromFileHeading: true,
  useTitleFromFrontmatter: true,
  useFolderTitleFromIndexFile: true,
  frontmatterOrderDefaultValue: 100,
  sortMenusByFrontmatterOrder: true,
  excludeFilesByFrontmatterFieldName: 'exclude'
};

export default defineConfig(withSidebar(vitePressOptions, vitePressSidebarOptions));
// export default vitePressOptions;
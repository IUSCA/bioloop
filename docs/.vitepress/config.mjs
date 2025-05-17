import { defineConfig } from 'vitepress';
import { withMermaid } from "vitepress-plugin-mermaid";
import { withSidebar } from 'vitepress-sidebar';

// https://vitepress.dev/reference/site-config
let vitePressOptions =  {
  title: "Bioloop",
  base: "/bioloop-test/docs/",
  description: "Bioloop Documentation",
  head: [['link', { rel: 'icon', href: '/bioloop/docs/favicon.ico' }]],
  lastUpdated: true, // Enable last updated timestamp
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'UI', link: '/ui/' },
      { text: 'API', link: '/api/' },
      { text: 'Workers', link: '/worker/' },

    ],

    sidebar: [
      { text: 'Overview', link: '/', items: [
        { text: 'Architecture', link: '/architecture' },
        { text: 'Installation', items: [
          {text: 'Docker', link: '/install-docker', },
          {text: 'Local', link: '/install-local', },
        ] },
        { text: 'UI', link: '/ui/', items: [
          { text: 'Auth', link: '/ui/auth_explained' },
          { text: 'Util', link: '/ui/util_components' },
        ] },
        
        { text: 'API', link: '/api/' },
        { text: 'Worker', link: '/worker/' },
        { text: 'Secure Download', link: '/secure_download' },
        { text: 'Welcome Message', link: '/welcome-message' },
        { text: 'Contributing', link: '/pull_request_template' },
        { text: 'Template', link: '/template' }

      ]}
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
  sortMenusByFrontmatterOrder: true
};

export default defineConfig(withSidebar(vitePressOptions, vitePressSidebarOptions));
// export default vitePressOptions;
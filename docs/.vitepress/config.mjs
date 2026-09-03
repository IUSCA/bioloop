import { resolve } from 'node:path';
import { defineConfig } from 'vitepress';
import { withMermaid } from "vitepress-plugin-mermaid";
import { generateSidebar, withSidebar } from 'vitepress-sidebar';

const prePaintBackgroundCss = `
  html {
    background-color: #ffffff;
  }

  html.dark {
    background-color: #1b1b1f;
    color-scheme: dark;
  }
`;

const prePaintThemeScript = `
  (() => {
    const preference = localStorage.getItem('vitepress-theme-appearance') || 'auto';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = preference === 'auto' ? prefersDark : preference === 'dark';

    document.documentElement.classList.toggle('dark', isDark);
  })();
`;

// https://vitepress.dev/reference/site-config
let vitePressOptions =  {
  title: "Bioloop",
  base: "/bioloop/",
  description: "Bioloop Documentation",
  head: [
    ['link', { rel: 'icon', href: '/bioloop/docs/favicon.ico' }],
    ['style', {}, prePaintBackgroundCss]
  ],
  vite: {
    plugins: [{
      name: 'vitepress-pre-paint-theme',
      apply: 'serve',
      enforce: 'pre',
      transformIndexHtml() {
        return [
          {
            tag: 'script',
            attrs: { id: 'pre-paint-theme' },
            children: prePaintThemeScript,
            injectTo: 'head-prepend'
          },
          {
            tag: 'style',
            children: prePaintBackgroundCss,
            injectTo: 'head-prepend'
          }
        ];
      }
    }]
  },
  lastUpdated: true, // Enable last updated timestamp
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guides', link: '/guides/install-docker' },
      { text: 'Reference', link: '/reference/architecture' },
      { text: 'Contributing', link: '/contributing/ui-coding-standards' },
      { text: 'Design', link: '/design/' },

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

const resolvedVitePressOptions = withSidebar(vitePressOptions, vitePressSidebarOptions);

resolvedVitePressOptions.vite.plugins.push({
  name: 'vitepress-sidebar-hot-reload',
  apply: 'serve',
  configureServer(server) {
    const documentRootPath = vitePressSidebarOptions.documentRootPath.replace(/^\/+/, '');
    const documentRoot = resolve(process.cwd(), documentRootPath);
    let currentSidebar = JSON.stringify(resolvedVitePressOptions.themeConfig.sidebar);
    let updateTimer;

    const updateSidebar = (file) => {
      if (!file.endsWith('.md') || !file.startsWith(`${documentRoot}/`)) {
        return;
      }

      clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        const nextSidebar = generateSidebar(vitePressSidebarOptions);
        const serializedSidebar = JSON.stringify(nextSidebar);

        if (serializedSidebar === currentSidebar) {
          return;
        }

        currentSidebar = serializedSidebar;
        resolvedVitePressOptions.themeConfig.sidebar = nextSidebar;

        const siteDataModule = server.moduleGraph.getModuleById('/@siteData');
        if (siteDataModule) {
          server.moduleGraph.invalidateModule(siteDataModule);
        }

        server.ws.send({ type: 'full-reload' });
      }, 100);
    };

    server.watcher.add(documentRoot);
    server.watcher.on('add', updateSidebar);
    server.watcher.on('change', updateSidebar);
    server.watcher.on('unlink', updateSidebar);

    server.httpServer?.once('close', () => {
      clearTimeout(updateTimer);
      server.watcher.off('add', updateSidebar);
      server.watcher.off('change', updateSidebar);
      server.watcher.off('unlink', updateSidebar);
    });
  }
});

export default defineConfig(resolvedVitePressOptions);

import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Bioloop",

  description: "Bioloop Documentation",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Docs', link: '/docs/' },

    ],

    sidebar: [
      { text: 'Overview', link: '/docs/', items: [
        { text: 'Installation', items: [
          {text: 'Docker', link: '/docs/install-docker', },
          { text: 'Template', link: '/docs/template' }
        ] },
        { text: 'Ui', link: '/docs/ui/', items: [
          { text: 'Auth', link: '/docs/ui/auth_explained' },
          { text: 'Util', link: '/docs/ui/util_components' },
        ] },
        { text: 'Api', link: '/docs/api/' , items: [
          { text: 'Examples', link: '/docs/api/api-examples' },
        ]},
        { text: 'Worker', link: '/docs/worker/' },
        { text: 'Secure Download', link: '/docs/secure_download' },
        { text: 'Contributing', link: '/docs/pull_request_template' },

      ]}
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/IUSCA/bioloop' }
    ]
  }
})

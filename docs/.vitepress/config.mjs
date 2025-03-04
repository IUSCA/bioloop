import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Bioloop",
  base: "/bioloop/docs/",
  description: "Bioloop Documentation",
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
    ]
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
})

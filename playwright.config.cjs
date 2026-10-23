const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/release', timeout: 90000, expect: { timeout: 30000 },
  forbidOnly: !!process.env.CI, retries: 0, workers: 1,
  reporter: [['list'], ['html', {open:'never'}]],
  use: {baseURL:'http://127.0.0.1:4176', trace:'retain-on-failure', screenshot:'only-on-failure'},
  webServer: {command:'node tools/preview-site.cjs', url:'http://127.0.0.1:4176', reuseExistingServer:!process.env.CI},
  projects: [
    {name:'desktop', use:{browserName:'chromium', viewport:{width:1440,height:1000}}},
    {name:'phone', use:{...devices['Pixel 7'], viewport:{width:375,height:812}}},
    {name:'large-phone', use:{browserName:'chromium', viewport:{width:430,height:932}, isMobile:true, hasTouch:true}},
    {name:'small-phone', use:{browserName:'chromium', viewport:{width:320,height:740}, isMobile:true, hasTouch:true}},
    {name:'safari-phone', use:{...devices['iPhone 13']}},
  ],
});


### Record tests

The Playwright plugin offers the ability to generate test scripts via actions performed in the browser, thus circumventing the need to write tests manually.

The plugin offers two ways to record a test:
- `Record New`
  - Allows you to record a test with no pre-defined steps
- `Record at cursor`
  - Allows you to record a test which may have pre-defined steps. This option:
    - first runs any dependency projects that you may have defined on your actual tests (for situations like logging-in prior to the test)
    - then runs your actual test

  
To record a test via the `Record at cursor` feature:
- Create your test file (`myTest.spec.js`), and add it to `playwright.config.js`.
  - Define any dependency projects for your test, if needed
- If needed, establish a base state in your test before you start recording.
  - This could include navigating to a particular URL, setting database state, etc.
- Hit the 'Play' button that's next to the `test` block to launch the test.
  - Check the `Show browser` checkbox to ensure that tests run in a headed browser
- Once Playwright is finished running the code in `myTest.spec.js`, the browser will stay open.
- Now, go back to VS Code, and click `Record at cursor`.
- Go back to the browser where your test is running.
- You can now make Playwright generate the rest of the test via the actions that you take in the browser.
  - Playwright will generate locators for each DOM element you that interact with, which can later be improved manually if needed.
  - Assertions can be made on the value, the text and the visibility of DOM elements.


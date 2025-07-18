import { test } from '../../../../fixtures/test_fixture';

test.use({ testFnParam: 'myDataFromTest' });

test('parameterized fixture test', async ({ testFn }) => {

});

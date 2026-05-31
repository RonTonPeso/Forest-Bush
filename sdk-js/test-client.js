// this is a simple script to test the sdk locally.
// it assumes you have the api server from the ../api directory running locally.
// run this script from the sdk-js directory using: node test-client.js

const { ForestBushClient } = require('./dist/index.js');

const client = new ForestBushClient({
  host: 'http://localhost:8080',
  cacheTTL: 2, // cache for 2 seconds
});

// helper to add a delay
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('--- running sdk tests ---');

  // test 1: a flag that exists (the 50% rollout one)
  console.log('\\nchecking flag: percent-rollout-50');
  const isEnabled1 = await client.evaluate('percent-rollout-50', false, 'test-user-1');
  console.log('result for user "test-user-1":', isEnabled1);
  const isEnabled2 = await client.evaluate('percent-rollout-50', false, 'test-user-2');
  console.log('result for user "test-user-2":', isEnabled2);

  // test 2: a flag that does not exist
  console.log('\\nchecking flag: non-existent-flag');
  const isEnabled3 = await client.evaluate('non-existent-flag', false, 'test-user-3');
  console.log('result for non-existent-flag:', isEnabled3, '(should be default value: false)');

  // test 3: a flag that is globally disabled
  // (assumes you have a flag with key 'globally-disabled-flag' set to enabled=false)
  console.log('\\nchecking flag: globally-disabled-flag');
  const isEnabled4 = await client.evaluate('globally-disabled-flag', true, 'test-user-4');
  console.log('result for globally-disabled-flag:', isEnabled4, '(should be false, not default value)');

  // test 4: caching
  console.log('\\n--- testing cache ---');
  console.log('first call for "cache-test", should be a MISS');
  const cache1 = await client.evaluate('percent-rollout-50', false, 'cache-user');
  console.log('result:', cache1);

  console.log('\\nsecond call for "cache-test" immediately after, should be a HIT');
  const cache2 = await client.evaluate('percent-rollout-50', false, 'cache-user');
  console.log('result:', cache2);

  console.log('\\nsleeping for 3 seconds to exceed TTL...');
  await sleep(3000);

  console.log('\\nthird call for "cache-test" after TTL expiry, should be a MISS');
  const cache3 = await client.evaluate('percent-rollout-50', false, 'cache-user');
  console.log('result:', cache3);
  
  console.log('\\n--- sdk tests complete ---');
}

runTests(); 
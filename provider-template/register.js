#!/usr/bin/env node

/**
 * Register your API with the Pylon gateway.
 *
 * Usage:
 *   node register.js \
 *     --name "My Tool" \
 *     --description "What it does" \
 *     --url "https://my-app.fly.dev/api/my-tool" \
 *     --method GET \
 *     --cost 0.01 \
 *     --keywords "word1,word2,word3" \
 *     --output-type "application/json"
 */

import 'dotenv/config';

const PYLON_GATEWAY_URL = process.env.PYLON_GATEWAY_URL || 'https://api.pylonapi.com';
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv);

// Validate required args
const required = ['name', 'description', 'url', 'cost'];
for (const field of required) {
  if (!args[field]) {
    console.error(`❌ Missing required argument: --${field}`);
    console.error('\nUsage:');
    console.error('  node register.js --name "Tool" --description "Does X" --url "https://..." --cost 0.01');
    console.error('\nOptional: --method GET --keywords "a,b,c" --output-type "application/json"');
    process.exit(1);
  }
}

if (!WALLET_ADDRESS) {
  console.error('❌ WALLET_ADDRESS not set. Add it to .env or set it in your environment.');
  process.exit(1);
}

const id = args.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const capability = {
  id,
  name: args.name,
  description: args.description,
  keywords: (args.keywords || args.name.toLowerCase()).split(',').map(k => k.trim()),
  providerEndpoint: args.url,
  method: (args.method || 'GET').toUpperCase(),
  cost: `$${args.cost}`,
  inputSchema: {},
  outputType: args['output-type'] || 'application/json',
  provider: {
    name: args['provider-name'] || args.name,
    wallet: WALLET_ADDRESS,
    url: args['provider-url'] || '',
    contact: args['provider-contact'] || '',
  },
};

console.log('\n📋 Registering capability with Pylon:\n');
console.log(JSON.stringify(capability, null, 2));
console.log();

try {
  const response = await fetch(`${PYLON_GATEWAY_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(capability),
  });

  if (response.ok) {
    const data = await response.json();
    console.log('✅ Registration submitted successfully!');
    console.log(JSON.stringify(data, null, 2));
  } else {
    const text = await response.text();
    console.error(`❌ Registration failed (${response.status}): ${text}`);
  }
} catch (err) {
  console.error(`❌ Could not reach Pylon gateway at ${PYLON_GATEWAY_URL}`);
  console.error(`   ${err.message}`);
  console.error('\n💡 Tip: Save the JSON above and email it to providers@pylonapi.com');
}

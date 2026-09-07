# check-gpk

A CommonJS library + CLI tool to derive chain addresses from on-chain GPK and fetch balances.

## Install

```bash
npm install check-gpk
```

## Use as a library (CommonJS)

```js
const { getBalance } = require("check-gpk");

async function run() {
  const out = await getBalance({
    groupId: "0x000000000000000000000000000000000000000000000000006465765f333031",
    gpkAddr: "0xf0bFfF373EEF7b787f5aecb808A59dF714e2a6E7",
    rpcUrl: "https://gwan-ssl.wandevs.org:46891",
    coin: "btc",
    coinsConfig: {
      btc: { decimal: 8, gpkIndex: 2, apiBase: "https://mempool.space/api", network: "mainnet" },
    },
    verbose: 1,
  });

  console.log(JSON.stringify(out, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

## Use as a CLI

After install, you can run:

### Testnet

```bash
npx check-gpk \
  --groupId 0x000000000000000000000000000000000000000000000041726965735f303639 \
  --gpk 0xfc86ad558163c4933ebcfa217945af6e9a3bce06 \
  --rpc https://gwan-ssl.wandevs.org:56891 \
  --coin btc \
  --verbose 1
```

### Mainnet

```bash
npx check-gpk \
  --groupId 0x000000000000000000000000000000000000000000000041726965735f303639 \
  --gpk 0xfc86ad558163c4933ebcfa217945af6e9a3bce06 \
  --rpc https://gwan-ssl.wandevs.org:56891 \
  --coin xrp \
  --verbose 1
```

Or if installed globally:

```bash
npm i -g check-gpk
check-gpk --groupId ... --gpk ... --rpc ... --coin ... --verbose 1
```

## Development

```bash
npm test
```

Integration test (calls public RPC):

```bash
npm run test:integration
```

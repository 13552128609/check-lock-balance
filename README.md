# check-gpk

A CommonJS library + CLI tool to validate GPK shares against the on-chain GPK.

## Install

```bash
npm install check-gpk
```

## Use as a library (CommonJS)

```js
const { checkValid } = require("check-gpk");

async function run() {
  const out = await checkValid({
    groupId: "0x000000000000000000000000000000000000000000000000006465765f333031",
    smgAddr: "0xaA5A0f7F99FA841F410aafD97E8C435c75c22821",
    gpkAddr: "0xf0bFfF373EEF7b787f5aecb808A59dF714e2a6E7",
    rpcUrl: "https://gwan-ssl.wandevs.org:46891",
    verbose: 1,
  });

  console.log(JSON.stringify(out, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### Testnet example

```js
const { checkValid } = require("check-gpk");

async function run() {
  const out = await checkValid({
    groupId: "0x000000000000000000000000000000000000000000000000006465765f333031",
    smgAddr: "0xaA5A0f7F99FA841F410aafD97E8C435c75c22821",
    gpkAddr: "0xf0bFfF373EEF7b787f5aecb808A59dF714e2a6E7",
    rpcUrl: "https://gwan-ssl.wandevs.org:46891",
    verbose: 1,
  });

  console.log(JSON.stringify(out, null, 2));
}

run();
```

### Mainnet example

```js
const { checkValid } = require("check-gpk");

async function run() {
  const out = await checkValid({
    groupId: "0x000000000000000000000000000000000000000000000041726965735f303639",
    smgAddr: "0x1e7450d5d17338a348c5438546f0b4d0a5fbeab6",
    gpkAddr: "0xfc86ad558163c4933ebcfa217945af6e9a3bce06",
    rpcUrl: "https://gwan-ssl.wandevs.org:56891",
    verbose: 1,
  });

  console.log(JSON.stringify(out, null, 2));
}

run();
```

## Use as a CLI

After install, you can run:

### Testnet

```bash
npx check-gpk \
  --groupId 0x000000000000000000000000000000000000000000000000006465765f333031 \
  --smg 0xaA5A0f7F99FA841F410aafD97E8C435c75c22821 \
  --gpk 0xf0bFfF373EEF7b787f5aecb808A59dF714e2a6E7 \
  --rpc https://gwan-ssl.wandevs.org:46891 \
  --verbose 1
```

### Mainnet

```bash
npx check-gpk \
  --groupId 0x000000000000000000000000000000000000000000000041726965735f303639 \
  --smg 0x1e7450d5d17338a348c5438546f0b4d0a5fbeab6 \
  --gpk 0xfc86ad558163c4933ebcfa217945af6e9a3bce06 \
  --rpc https://gwan-ssl.wandevs.org:56891 \
  --verbose 1
```

Or if installed globally:

```bash
npm i -g check-gpk
check-gpk --groupId ... --smg ... --gpk ... --rpc ... --verbose 1
```

## Development

```bash
npm test
```

Integration test (calls public RPC):

```bash
npm run test:integration
```

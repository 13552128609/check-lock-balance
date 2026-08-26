#!/usr/bin/env node

const { parseArgs } = require("./lib/cli/args");
const { checkValid } = require("./lib/checkValid");

async function main() {
  const args = parseArgs(process.argv);

  const groupId = args.groupId;
  const smgAddr = args.smg;
  const gpkAddr = args.gpk;
  const rpcUrl = args.rpc;
  const verbose = args.verbose;

  if (!groupId || !smgAddr || !gpkAddr || !rpcUrl) {
    console.error("Usage: node main.js --groupId <0xbytes32> --smg <addr> --gpk <addr> --rpc <url>");
    process.exit(1);
  }

  const out = await checkValid({
    groupId,
    smgAddr,
    gpkAddr,
    rpcUrl,
    verbose,
  });

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});

/*
=====
mainnet
=====
node /home/jacob/wanchain/check-gpk/main.js \
  --groupId 0x000000000000000000000000000000000000000000000041726965735f303639 \
  --smg  0x1e7450d5d17338a348c5438546f0b4d0a5fbeab6 \
  --gpk 0xfc86ad558163c4933ebcfa217945af6e9a3bce06 \
  --rpc https://gwan-ssl.wandevs.org:56891 \
  --verbose 1
*/

/*
response :

{
  "grpId": "0x000000000000000000000000000000000000000000000041726965735f303639",
  "gpkCount": 3,
  "smNumber": 25,
  "thresholds": [
    17,
    9,
    17
  ],
  "results": [
    {
      "0x145b3fdc96bfd863da0c5cb533e3308cba0996025aced2f5d3ca99357082b21607671d3e85cf4434ce798fc83a5000fb55f4ebcae4b0fad9e4d3ffd113e68006": true,
      "0x445fac73e9eb547aedf84d4d280e8125afad04d0e897519bcce2d40f4f007d25161ff7a31f0b6f4a40cd76eaba7940c6ac69d12e547e514e2a5c17cad8899629": true,
      "0x1304ef8c6f0652f95477a7efc4fff4e84b485972f2007aecb2434bf5b5711839f2861c6a72825ee3728cb9229404175e74ce78e34b0d2c919c26c26266493a6b": true
    }
  ]
}

======
testnet
======

node /home/jacob/wanchain/check-gpk/main.js \
  --groupId 0x000000000000000000000000000000000000000000000000006465765f333031 \
  --smg  0xaA5A0f7F99FA841F410aafD97E8C435c75c22821 \
  --gpk 0xf0bFfF373EEF7b787f5aecb808A59dF714e2a6E7 \
  --rpc https://gwan-ssl.wandevs.org:46891 \
  --verbose 1


*/
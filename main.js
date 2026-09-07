#!/usr/bin/env node

const { parseArgs } = require("./lib/cli/args");
const { getBalance } = require("./lib/getBalance");

// index0=(1,1) index1=(0,0),index1=(0,2)
const COINS = {
  "xrp":{
    decimal:6,
    symbol:"xrp",
    url:"https://xrpl.org/docs/rest-api.html",
    gpkIndex:1,
    // JSON-RPC endpoint, e.g. https://s1.ripple.com:51234
    rpcUrl: "https://xrplcluster.com/",
  },
  "btc":{
    decimal:8,
    symbol:"btc",
    url:"https://developer.bitcoin.org/reference/rpc/",
    gpkIndex:2,
    // Use an esplora-compatible API, e.g. https://blockstream.info/api
    apiBase: "https://mempool.space/api",
    // mainnet | testnet
    network: "mainnet",
  },
  "ada":{
    decimal:6,
    symbol:"ada",
    url:"https://docs.cardano.org/native-tokens/learn",
    gpkIndex:1,
    // Koios API base, e.g. https://api.koios.rest/api/v1
    apiBase: "",
    // mainnet | testnet
    network: "mainnet",
  },
};

async function main() {
  const args = parseArgs(process.argv);

  const groupId = args.groupId;
  const gpkAddr = args.gpk;
  const rpcUrl = args.rpc;
  const verbose = args.verbose;
  const coin = args.coin;

  if (!groupId || !gpkAddr || !coin) {
    console.error("Usage: node main.js --groupId <0xbytes32> --gpk <addr> --rpc <url> --coin <xrp|btc|ada> [--verbose 1]");
    process.exit(1);
  }

  if (!COINS[coin]) {
    console.error(`Unsupported coin=${coin}. Expected one of: ${Object.keys(COINS).join("|")}`);
    process.exit(1);
  }

  const out = await getBalance({
    groupId,    
    gpkAddr,
    rpcUrl,
    verbose,
    coin,
    coinsConfig: COINS,
  });

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error("[FATAL]", e);
  process.exit(1);
});

/*
1.  xrp
node main.js --groupId 0x000000000000000000000000000000000000000000000041726965735f303639 \
  --gpk 0xFC86Ad558163C4933eBCfA217945aF6e9a3bcE06 \
  --coin xrp \
  --rpc https://gwan-ssl.wandevs.org:56891



  rMVKvpoCJgmjEmVgjg6okixAT4T6j97mW5
{
  "coin": "xrp",
  "gpkIndex": 1,
  "gpkHex": "0x445fac73e9eb547aedf84d4d280e8125afad04d0e897519bcce2d40f4f007d25161ff7a31f0b6f4a40cd76eaba7940c6ac69d12e547e514e2a5c17cad8899629",
  "address": "rMVKvpoCJgmjEmVgjg6okixAT4T6j97mW5",
  "rawBalance": "723422555052",
  "decimal": 6,
  "balance": "723422.555052"
}


2.  btc

node main.js --groupId 0x000000000000000000000000000000000000000000000041726965735f303639 \
  --gpk 0xFC86Ad558163C4933eBCfA217945aF6e9a3bcE06 \
  --coin btc \
  --rpc https://gwan-ssl.wandevs.org:56891


  bc1p85xq5nuf6wyp3uw86lauj2vx77yw5gck4du7rrv9w7ffhljvytuqsh0p2q
{
  "coin": "btc",
  
  "gpkIndex": 2,
  "gpkHex": "0x1304ef8c6f0652f95477a7efc4fff4e84b485972f2007aecb2434bf5b5711839f2861c6a72825ee3728cb9229404175e74ce78e34b0d2c919c26c26266493a6b",
  "address": "bc1p85xq5nuf6wyp3uw86lauj2vx77yw5gck4du7rrv9w7ffhljvytuqsh0p2q",
  "rawBalance": "1101721862",
  "decimal": 8,
  "balance": "11.01721862"
}


3. ada



*/
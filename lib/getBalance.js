const { ethers } = require("ethers");
const crypto = require("crypto");
const { ec: EC } = require("elliptic");
const keypairs = require("ripple-keypairs");

const { GPK_ABI } = require("./eth/abis");
const { hexToBuf, normalize64Bytes } = require("./utils/bytes");
const { createLogger } = require("./utils/logger");
const { getSmgP2trAddress, bitcoin: btcjs } = require("./utils/btc/taproot");

const Secp256k1 = new EC("secp256k1");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function strip0x(hex) {
  return typeof hex === "string" && hex.startsWith("0x") ? hex.slice(2) : hex;
}

function bufToHex(buf) {
  return "0x" + Buffer.from(buf).toString("hex");
}

function blake2b224(buf) {
  // Node supports outputLength on newer versions; fallback to slicing.
  try {
    return crypto.createHash("blake2b512", { outputLength: 28 }).update(buf).digest();
  } catch {
    return crypto.createHash("blake2b512").update(buf).digest().subarray(0, 28);
  }
}

function bigIntToDecimalString(value, decimals) {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const intPart = v / base;
  const fracPart = v % base;

  if (decimals === 0) return (neg ? "-" : "") + intPart.toString();

  const frac = fracPart.toString().padStart(decimals, "0").replace(/0+$/, "");
  return (neg ? "-" : "") + intPart.toString() + (frac.length ? "." + frac : "");
}

const SECP256K1_P = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F");

function gpk64ToXyEvenY(gpkHex) {
  const b = normalize64Bytes(gpkHex);
  assert(b.length === 64, `expected 64 bytes gpk, got ${b.length}`);

  const xBuf = Buffer.from(b.subarray(0, 32));
  const yBuf = Buffer.from(b.subarray(32, 64));

  let y = BigInt("0x" + yBuf.toString("hex"));
  if ((y & 1n) === 1n) {
    y = (SECP256K1_P - y) % SECP256K1_P;
  }
  const yEvenBuf = Buffer.from(y.toString(16).padStart(64, "0"), "hex");

  return {
    xBuf,
    yBuf: yEvenBuf,
    pubkeyUncompressed: Buffer.concat([Buffer.from([0x04]), xBuf, yEvenBuf]),
    xOnly: xBuf,
  };
}

// --- bech32 ---

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values) {
  const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GENERATORS[i];
    }
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp) {
  const ret = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >>> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32CreateChecksum(hrp, data, spec) {
  const constVal = spec === "bech32m" ? 0x2bc830a3 : 1;
  const values = bech32HrpExpand(hrp).concat(data);
  const mod = bech32Polymod(values.concat([0, 0, 0, 0, 0, 0])) ^ constVal;
  const ret = [];
  for (let p = 0; p < 6; p++) {
    ret.push((mod >>> (5 * (5 - p))) & 31);
  }
  return ret;
}

function bech32Encode(hrp, data, spec) {
  const combined = data.concat(bech32CreateChecksum(hrp, data, spec));
  let out = hrp + "1";
  for (const v of combined) out += BECH32_CHARSET[v];
  return out;
}

function convertBits(data, fromBits, toBits, pad) {
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxv = (1 << toBits) - 1;

  for (const value of data) {
    assert(value >= 0 && (value >>> fromBits) === 0, "convertBits: invalid value");
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >>> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
  } else {
    assert(bits < fromBits, "convertBits: excess padding");
    assert(((acc << (toBits - bits)) & maxv) === 0, "convertBits: non-zero padding");
  }

  return ret;
}

// --- Address derivation ---

function deriveBtcP2trAddressFromGpk(gpkHex, network) {
  const n = network === "testnet" ? btcjs.networks.testnet : btcjs.networks.bitcoin;
  // taproot util expects internal key material and builds script-tree P2TR address
  return getSmgP2trAddress(gpkHex, n);
}

function deriveXrpClassicAddressFromGpk(gpkHex) {
  const raw = strip0x(gpkHex);
  assert(typeof raw === "string", "invalid gpkHex");
  const pubkey = Secp256k1.keyFromPublic("04" + raw, "hex");
  const compressed = pubkey.getPublic(true, "hex");
  return keypairs.deriveAddress(compressed.toUpperCase());
}

function deriveAdaBaseAddressFromGpk(gpkHex, network) {
  // Cardano base address uses payment key hash + stake key hash (both 28 bytes blake2b-224)
  // Here we deterministically derive both from the same 64-byte gpk point (uncompressed secp256k1 pubkey).
  const { pubkeyUncompressed } = gpk64ToXyEvenY(gpkHex);

  const paymentHash = blake2b224(pubkeyUncompressed);
  const stakeHash = blake2b224(pubkeyUncompressed);

  const networkId = network === "testnet" ? 0 : 1;
  const addrType = 0; // base address: 0000
  const header = (addrType << 4) | (networkId & 0x0f);

  const payload = Buffer.concat([Buffer.from([header]), paymentHash, stakeHash]);
  const words = convertBits(Array.from(payload), 8, 5, true);
  const hrp = network === "testnet" ? "addr_test" : "addr";

  return bech32Encode(hrp, words, "bech32");
}

// --- Balance fetchers ---

async function httpJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}${txt ? `: ${txt}` : ""}`);
  }
  return await res.json();
}

async function fetchBtcBalanceSats(address, apiBase) {
  const info = await httpJson(`${apiBase}/address/${address}`);
  const cs = info.chain_stats || {};
  const funded = BigInt(cs.funded_txo_sum || 0);
  const spent = BigInt(cs.spent_txo_sum || 0);
  return funded - spent;
}

async function fetchXrpBalanceDrops(address, rpcUrl) {
  const body = {
    method: "account_info",
    params: [{ account: address, ledger_index: "validated" }],
  };

  const json = await httpJson(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (json && json.error) {
    throw new Error(`${json.error}: ${json.error_message || ""}`);
  }

  const bal = json?.result?.account_data?.Balance;
  assert(typeof bal === "string", "invalid XRP response: missing Balance");
  return BigInt(bal);
}

async function fetchAdaBalanceLovelace(address, apiBase) {
  // Koios: GET /address_info?_address=<bech32>
  const arr = await httpJson(`${apiBase}/address_info?_address=${encodeURIComponent(address)}`);
  assert(Array.isArray(arr) && arr.length > 0, "invalid ADA response: empty");
  const bal = arr[0]?.balance;
  assert(typeof bal === "string" || typeof bal === "number", "invalid ADA response: missing balance");
  return BigInt(bal);
}

async function getBalance({ groupId, gpkAddr, rpcUrl, verbose, coin, coinsConfig }) {
  const logger = createLogger({ verbose });

  assert(coin, "missing coin");
  const cfg = coinsConfig?.[coin];
  assert(cfg, `unsupported coin=${coin}`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const gpkSc = new ethers.Contract(gpkAddr, GPK_ABI, provider);

  logger.log(`[getBalance] coin=${coin}`);
  logger.log(`[getBalance] groupId=${groupId}`);
  logger.log(`[getBalance] gpk=${gpkAddr}`);
  logger.log(`[getBalance] rpc=${rpcUrl}`);
  logger.log(`[getBalance] gpkIndex=${cfg.gpkIndex}`);

  const gpkBytes = await gpkSc.getGpkbyIndex(groupId, cfg.gpkIndex);
  const gpkHex = typeof gpkBytes === "string" ? gpkBytes : bufToHex(gpkBytes);
  const gpkBuf = hexToBuf(gpkHex);
  assert(gpkBuf.length === 64, `expected 64 bytes gpk, got ${gpkBuf.length}`);

  let address;
  let rawBalance;

  if (coin === "btc") {
    const network = cfg.network || "mainnet";
    address = deriveBtcP2trAddressFromGpk(gpkHex, network);
    console.log(address);
    const apiBase = cfg.apiBase;
    assert(apiBase, "missing COINS.btc.apiBase");
    rawBalance = await fetchBtcBalanceSats(address, apiBase);
  } else if (coin === "xrp") {
    address = deriveXrpClassicAddressFromGpk(gpkHex);
    console.log(address);
    const xrpRpc = cfg.rpcUrl;
    assert(xrpRpc, "missing COINS.xrp.rpcUrl");
    rawBalance = await fetchXrpBalanceDrops(address, xrpRpc);
  } else if (coin === "ada") {
    const network = cfg.network || "mainnet";
    address = deriveAdaBaseAddressFromGpk(gpkHex, network);
    console.log(address);
    const apiBase = cfg.apiBase;
    assert(apiBase, "missing COINS.ada.apiBase");
    rawBalance = await fetchAdaBalanceLovelace(address, apiBase);
  } else {
    throw new Error(`unsupported coin=${coin}`);
  }

  const decimals = Number(cfg.decimal || 0);
  const balance = bigIntToDecimalString(rawBalance, decimals);

  logger.log(`[getBalance] address=${address}`);
  logger.log(`[getBalance] rawBalance=${rawBalance.toString()}`);
  logger.log(`[getBalance] balance=${balance}`);

  return {
    coin,
    gpkIndex: cfg.gpkIndex,
    gpkHex: "0x" + strip0x(gpkHex),
    address,
    rawBalance: rawBalance.toString(),
    decimal: decimals,
    balance,
  };
}

module.exports = {
  getBalance,
};

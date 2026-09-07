const bitcoin = require('bitcoinjs-lib')
const bip341 = require('bitcoinjs-lib/src/payments/bip341')
const psbtUtils = require('bitcoinjs-lib/src/psbt/psbtutils')
const bufferutils = require('bitcoinjs-lib/src/bufferutils')
const { OPS } = require('bitcoinjs-lib/src/ops')
const varUint = require('varuint-bitcoin')
const ECPAIR = require('ecpair')
const crypto = require('crypto')

const ecc =  require('tiny-secp256k1')
bitcoin.initEccLib(ecc)
const ECPair = ECPAIR.ECPairFactory(ecc)

// let ecc = null
// let gInit = false
// let ECPair = null
// async function init(){
//   if (!gInit) {
//     gInit = true
//     // tiny-secp256k1 v2 is an ESM module, so we can't "require", and must import async
//     ecc = await import('tiny-secp256k1');
//     bitcoin.initEccLib(ecc)
//     ECPair = ECPAIR.ECPairFactory(ecc)
//   }
// }

// setTimeout(async () => {
//   await init()
// })

function getP2TRAddr(scriptOut, network) {
  return bitcoin.address.fromOutputScript(scriptOut, network);
}

function hexAdd0x(hexs) {
  if (0 != hexs.indexOf('0x')) {
    return '0x' + hexs;
  }
  return hexs;
}

function hexTrip0x(hexs) {
    if (0 == hexs.indexOf('0x')) {
        return hexs.slice(2);
    }
    return hexs;
}

function getHash(randomId, userAccount) {
    // const crypto = require('crypto')
    const hash = crypto.createHash('sha256');
    hash.update(hexAdd0x(randomId) + userAccount);
    let ret = hash.digest('hex');
    console.log('getHash randomId = %s userAccount=%s hash(randomId,userAccount)', randomId, userAccount, ret);

    return hexTrip0x(ret);
}

function getHash1(randomId, userAccount) {
  const hash = bitcoin.crypto.sha256(hexAdd0x(randomId) + userAccount)
  return hexTrip0x(hash.toString('hex'))
}

// in: hexString
// out: byte
function  getXBytes(pk){
  let pkTemp = pk;
  if(pk.slice(0,2).toString().toLowerCase() === "0x"){
    pkTemp = pk.slice(2)
  }
  if(pkTemp.length == 64){
    return Buffer.from(pkTemp.slice(0,64),'hex')
  }
  if(pkTemp.length == 66){
    return Buffer.from(pkTemp.slice(2,66),'hex')
  }
  if(pkTemp.length == 128){
    return Buffer.from(pkTemp.slice(0,64),'hex')
  }
  if(pkTemp.length == 130){
    return Buffer.from(pkTemp.slice(2,66),'hex')
  }
  return "";
}

const toXOnly = pubKey => {
  if (!(pubKey instanceof Buffer)) {
    return null
  }

  if (pubKey.length === 32) {
    return pubKey
  }

  if (pubKey.length === 33 || pubKey.length === 65) {
    return pubKey.slice(1, 33)
  }

  if (pubKey.length === 64) {
    return pubKey.slice(0, 32)
  }

  return null
}


function encodeBuf(s) {
  // 长度小于255的话，可以
  // return Buffer.concat([s.length], s)
  const varLen = varUint.encodingLength(s.length)
  const l = Buffer.allocUnsafe(varLen)
  varUint.encode(s.length, l)

  return Buffer.concat([l, s])
}

function toLeafHash(leafScript) {
  const version = leafScript.version || 0xc0;
  const leafData = Buffer.concat([Buffer.from([version]), encodeBuf(leafScript.output)])
  return bitcoin.crypto.taggedHash('TapLeaf', leafData)
}

function toTreeHash(treeScript) {
  if (Array.isArray(treeScript)) {
    const hashes = [toTreeHash(scriptTree[0]), toTreeHash(scriptTree[1])];
    hashes.sort((a, b) => a.hash.compare(b.hash));
    const [left, right] = hashes;
    return {
      hash: bitcoin.crypto.taggedHash('TapBranch', Buffer.concat(left, right)),
      left,
      right,
    };
  } else {
    return { hash: toLeafHash(treeScript) }
  }
}

function tweakKey(pubKey, h) {
  if (pubKey.length !== 32) return null
  if (h && h.length !== 32) return null

  const tweakHash = bitcoin.crypto.taggedHash('TapTweak', Buffer.concat(h ? [pubKey, h] : [pubKey]));
  const res = ecc.xOnlyPointAddTweak(pubKey, tweakHash);
  if (!res || res.xOnlyPubkey === null) return null;
  return {
    parity: res.parity,
    x: Buffer.from(res.xOnlyPubkey),
  };
}

function tweakHash(pubKey, h) {
  return bitcoin.crypto.taggedHash('TapTweak', Buffer.concat(h ? [pubKey, h] : [pubKey]));
}

function tweakSigner(signer, opts) {
  let privateKey= signer.privateKey
  if (!privateKey) {
    throw new Error('Private key is required for tweaking signer!');
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tweakHash(toXOnly(signer.publicKey), opts.tweakHash),
  );
  if (!tweakedPrivateKey) {
    throw new Error('Invalid tweaked private key!');
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

const getAddressType = (address, network) => {
  if (address.length > 40) {
    const lock = bitcoin.address.fromBech32(address)
    if (lock.prefix === network.bech32) {
      if (lock.version === 1) {
        if (lock.data.length === 32) {
          return "p2tr"
        }
      } else if (lock.version === 0) {
        if (lock.data.length === 20) {
          return "p2wpkh"
        } else if (lock.data.length === 32) {
          return "p2wsh"
        }
      }
    }
  } else {
    const lock = bitcoin.address.fromBase58Check(address)
    if (lock.version === network.pubKeyHash) {
      if (lock.hash.length === 20) {
        return "p2pkh"
      }
    } else if (lock.version === network.scriptHash) {
      if (lock.hash.length === 20) {
        return "p2sh"
      }
    }
  }

  return "unknown"
}

const getAddressTypeByOutScript = (outScript) => {
  switch (outScript.length) {
    // p2pkh
    case 25:
      if (
        outScript[0] === OPS.OP_DUP &&
        outScript[1] === OPS.OP_HASH160 &&
        outScript[2] === 0x14 &&
        outScript[23] === OPS.OP_EQUALVERIFY &&
        outScript[24] === OPS.OP_CHECKSIG ) {
        return 'p2pkh'
      }
      break
    case 23:
      if (
        outScript[0] === OPS.OP_HASH160 &&
        outScript[1] === 0x14 &&
        outScript[22] === OPS.OP_EQUAL
      ) {
        return 'p2sh'
      }
      break
    case 34:
      if (
        outScript[0] === OPS.OP_1 &&
        outScript[1] === 0x20
      ) {
        return 'p2tr'
      }
      if (
        outScript[0] === OPS.OP_0 &&
        outScript[1] === 0x20
      ) {
        return 'p2wsh'
      }
      break
    case 22:
      if (
        outScript[0] === OPS.OP_0 &&
        outScript[1] === 0x14
      ) {
        return 'p2wpkh'
      }
  }
  return "unknown"
}

function hashToAddress(hash, addressType, network) {
  let version;

  if (addressType === 'pubkeyhash') {
    version = network.pubKeyHash;
    return bitcoin.address.toBase58Check(Buffer.from(hexTrip0x(hash), "hex"), version)
  } else if (addressType === 'scripthash') {
    version = network.scriptHash;
    return bitcoin.address.toBase58Check(Buffer.from(hexTrip0x(hash), "hex"), version)
  } else if (addressType === 'p2tr') {
    version = 1;
    return bitcoin.address.toBech32(Buffer.from(hexTrip0x(hash), "hex"), version, network.bech32)
  } else if (addressType === 'p2wsh') {
    version = 0;
    return bitcoin.address.toBech32(Buffer.from(hexTrip0x(hash), "hex"), version, network.bech32)
  }
  return null
}

function addressToLockHash(address, network) {
  if (address.length > 40) {
    const lock = bitcoin.address.fromBech32(address)
    if (lock.prefix === network.bech32) {
      if (lock.version === 1) {
        // p2tr , regtest length = 34, bitcoin 32, testnet 32
        if (lock.data.length === 32) {
          return lock.data.toString('hex')
        }
      } else if (lock.version === 0) {
        // uncompressed gpk don't support p2wpkh p2wsh
        // if (lock.data.length === 20) {
        //   // p2wpkh
        //   return lock.data.toString('hex')
        // } else if (lock.data.length === 32) {
        //   // p2wsh
        //   return lock.data.toString('hex')
        // }
      }
    }
  } else {
    const lock = bitcoin.address.fromBase58Check(address)
    if (lock.version === network.pubKeyHash) {
      if (lock.hash.length === 20) {
        // p2pkh
        return lock.hash.toString('hex')
      }
    } else if (lock.version === network.scriptHash) {
      if (lock.hash.length === 20) {
        // p2sh
        return lock.hash.toString('hex')
      }
    }
  }

  return null
}

function getOtaP2trRedeemScript(randomId, userAccount, xOnlyMpcPk) {
  let randomHash = getHash(randomId, userAccount);
  return bitcoin.script.fromASM(
  `
  ${hexTrip0x(randomHash)}
  OP_DROP
  OP_DUP
  OP_HASH160
  ${bitcoin.crypto.hash160(Buffer.from(xOnlyMpcPk, 'hex')).toString('hex')}
  OP_EQUALVERIFY
  OP_CHECKSIG
  `.trim().replace(/\s+/g, ' '),
  )
}

function getOtaP2TRAddr(randomId, userAccount, network, MPC_PK) {
  const xOnlyMpcPk = getXBytes(MPC_PK)
  const redeemScript = getOtaP2trRedeemScript(randomId, userAccount, xOnlyMpcPk)

  const scriptTree = {
    output: redeemScript,
    version: 0xc0
  }

  const p2tr = bitcoin.payments.p2tr({ 
    internalPubkey: xOnlyMpcPk,
    scriptTree: scriptTree,
    redeem: scriptTree,
    network 
  })
  return p2tr.address
}

function getSmgP2trRedeemScript(xOnlyMpcPk) {
  const redeemScript = bitcoin.script.fromASM(
    `
    OP_DUP
    OP_HASH160
    ${bitcoin.crypto.hash160(xOnlyMpcPk).toString('hex')}
    OP_EQUALVERIFY
    OP_CHECKSIG
    `.trim().replace(/\s+/g, ' '),
  )

  return redeemScript
}

function getSmgP2trAddress(gpk, network) {
  const xOnlyMpcPk = getXBytes(gpk)
  const redeemScript = getSmgP2trRedeemScript(xOnlyMpcPk)
  const scriptTree = {
    output: redeemScript,
    version: 0xc0
  }

  const p2tr = bitcoin.payments.p2tr({ 
    internalPubkey: xOnlyMpcPk,
    scriptTree: scriptTree,
    redeem: scriptTree,
    network 
  })
  return p2tr.address
}

function buildP2trManual(leafScript, internalPubkey) {
  const scriptTree = {
    output: leafScript,
    version: 0xc0
  }

  const redeem = {
    output: leafScript,
    redeemVersion: 0xc0
  }

  const treeHash = toTreeHash(scriptTree)
  const leafHash = toLeafHash(redeem)
  // asset(treeHash.hash === leafHash)

  // path = leaf -> [ p1, ..., pn ]-> tree
  const path = []
  const outputKey = tweakKey(internalPubkey, treeHash.hash)
  const controlBlock = Buffer.concat([Buffer.from([redeem.redeemVersion | outputKey.parity]), internalPubkey].concat(path))
  
  return {
    leafHash,
    controlBlock,
  }
}

function buildP2tr(leafScript, internalPubkey, network) {
  const scriptTree = {
    output: leafScript,
  }

  const redeem = {
    output: leafScript,
    redeemVersion: 0xc0
  }

  // 2.2 生成控制块
  const p2tr = bitcoin.payments.p2tr({
    internalPubkey,
    scriptTree,
    redeem,
    network,
  });

  const leafHash = bip341.tapleafHash({
    output: redeem.output,
    version: redeem.redeemVersion
  })

  return {
    leafHash,
    leafScript: p2tr.witness[p2tr.witness.length - 2],
    controlBlock: p2tr.witness[p2tr.witness.length - 1],
  }
}

function addP2trShInput(psbt, input, redeemScript, xOnlyMpcPk, network) {
  const scriptTree = {
    output: redeemScript,
  }
  const redeem = {
    output: redeemScript,
    redeemVersion: 0xc0
  }
  const p2tr = bitcoin.payments.p2tr({
    internalPubkey: xOnlyMpcPk,
    scriptTree,
    redeem,
    network
  });

  if (p2tr.address !== input.address) {
    throw new Error(`address ${input.address} != ${p2tr.address}, detail: rand= ${this.record.walletLockEvent[0].randomId}, account= ${this.record.crossAddress}, xPk= ${xOnlyMpcPk}`)
  }

  const tapLeafScript = {
    leafVersion: redeem.redeemVersion,
    script: redeem.output,
    controlBlock: p2tr.witness[p2tr.witness.length - 1] // extract control block from witness data
  }
  
  psbt.addInput({
    hash: input.txid,
    index: input.vout,
    witnessUtxo: { value: input.value, script: p2tr.output },
    tapLeafScript: [
      tapLeafScript
    ],
    // tapInternalKey: xOnlyMpcPk,
  })
}

const customFinalizer = (_inputIndex, input) => {
  const witness = [
    signatureBuf,
    xOnlyMpcPk,
  ].concat(input.tapLeafScript[0].script)
  .concat(input.tapLeafScript[0].controlBlock)

  return {
    finalScriptWitness: psbtUtils.witnessStackToScriptWitness(witness)
  }
}

function finalizeInput(psbt, index, signature, xOnlyMpcPk) {
  const customFinalizer = (_inputIndex, input) => {
    const witness = [
      signature,
      xOnlyMpcPk,
    ].concat(input.tapLeafScript[0].script)
    .concat(input.tapLeafScript[0].controlBlock)

    return {
      finalScriptWitness: psbtUtils.witnessStackToScriptWitness(witness)
    }
  }

  psbt.finalizeInput(index, customFinalizer);
}

function arrayToBuffer(bs) {
  let total = varUint.encodingLength(bs.length)
  for (let i = 0; i < bs.length; i++) {
    const s = bs[i]
    const varLen = varUint.encodingLength(s.length)
    total += varLen
    total += s.length
  }
  const b = Buffer.allocUnsafe(total)
  const bufferWriter = new bufferutils.BufferWriter(b)
  bufferWriter.writeVector(bs)
  return bufferWriter.end()
}

function bufferToArray(b) {
  const bufferReader = new bufferutils.BufferReader(b)
  const bs = bufferReader.readVector()
  return bs
}

module.exports = {
    getHash,
    getP2TRAddr,
    getXBytes,
    getSmgP2trAddress,
    getSmgP2trRedeemScript,
    getOtaP2TRAddr,
    getOtaP2trRedeemScript,
    addressToLockHash,
    getAddressType,
    getAddressTypeByOutScript,
    buildP2tr,
    buildP2trManual,
    hashToAddress,
    addP2trShInput,
    finalizeInput,
    arrayToBuffer,
    bufferToArray,
    ECPair,
    bitcoin,
    ecc,
};

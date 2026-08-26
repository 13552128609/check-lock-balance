const test = require("node:test");
const assert = require("node:assert/strict");

const { checkValid } = require("../lib/checkValid");

function makeDeps({ smgSc, gpkSc }) {
  return {
    providerFactory: () => ({ mockProvider: true }),
    contractFactory: (addr) => {
      const a = String(addr || "").toLowerCase();
      if (a.includes("smg")) return smgSc;
      if (a.includes("gpk")) return gpkSc;
      throw new Error(`unexpected contract addr=${addr}`);
    },
  };
}

function makeHappyMocks({
  gpkCount = 3,
  smNumber = 2,
  threshold = 1,
  gpkHex64 = "0x" + "11".repeat(64),
  shareHex64 = "0x" + "22".repeat(64),
  pkHex = "0x" + "33".repeat(33),
} = {}) {
  const gpkSc = {
    getGpkCount: async () => gpkCount,
    getGpkbyIndex: async () => gpkHex64,
    groupMap: async () => ({ smNumber }),
    getGpkSharebyIndex: async () => shareHex64,
  };

  const smgSc = {
    getThresholdByGrpId: async () => threshold,
    getSelectedSmInfo: async () => ({ PK: pkHex }),
  };

  return { smgSc, gpkSc };
}

test("rainy: missing required params", async () => {
  await assert.rejects(
    () => checkValid({ groupId: "0x01", smgAddr: "smg", gpkAddr: "gpk", rpcUrl: "" }),
    /missing required params/i
  );
});

test("rainy: invalid gpkCount=0", async () => {
  const { smgSc, gpkSc } = makeHappyMocks({ gpkCount: 0 });
  const deps = makeDeps({ smgSc, gpkSc });

  await assert.rejects(
    () =>
      checkValid({
        groupId: "0x01",
        smgAddr: "smg",
        gpkAddr: "gpk",
        rpcUrl: "http://mock",
        deps,
      }),
    /invalid gpkCount=0/
  );
});

test("rainy: invalid smNumber=0", async () => {
  const { smgSc, gpkSc } = makeHappyMocks({ smNumber: 0 });
  const deps = makeDeps({ smgSc, gpkSc });

  await assert.rejects(
    () =>
      checkValid({
        groupId: "0x01",
        smgAddr: "smg",
        gpkAddr: "gpk",
        rpcUrl: "http://mock",
        deps,
      }),
    /invalid smNumber=0/
  );
});

test("rainy: invalid threshold=0", async () => {
  const { smgSc, gpkSc } = makeHappyMocks({ threshold: 0 });
  const deps = makeDeps({ smgSc, gpkSc });

  await assert.rejects(
    () =>
      checkValid({
        groupId: "0x01",
        smgAddr: "smg",
        gpkAddr: "gpk",
        rpcUrl: "http://mock",
        deps,
      }),
    /invalid threshold=0/
  );
});

test("rainy: invalid hex length from gpk value", async () => {
  const { smgSc, gpkSc } = makeHappyMocks({ gpkHex64: "0x123" });
  const deps = makeDeps({ smgSc, gpkSc });

  await assert.rejects(
    () =>
      checkValid({
        groupId: "0x01",
        smgAddr: "smg",
        gpkAddr: "gpk",
        rpcUrl: "http://mock",
        deps,
      }),
    /invalid hex length/i
  );
});

test("rainy: gpkShare not 64 bytes", async () => {
  const shareBad = "0x" + "22".repeat(63);
  const { smgSc, gpkSc } = makeHappyMocks({ shareHex64: shareBad, threshold: 1, smNumber: 1 });
  const deps = makeDeps({ smgSc, gpkSc });

  await assert.rejects(
    () =>
      checkValid({
        groupId: "0x01",
        smgAddr: "smg",
        gpkAddr: "gpk",
        rpcUrl: "http://mock",
        deps,
      }),
    /expected 64 bytes, got 63/
  );
});

test("rainy: gpkShare 64 bytes but wrong (should return false, not throw)", async () => {
  const gpkExpected = "0x" + "11".repeat(64);
  const shareWrong = "0x" + "ff".repeat(64);

  const { smgSc, gpkSc } = makeHappyMocks({
    gpkCount: 1,
    smNumber: 1,
    threshold: 1,
    gpkHex64: gpkExpected,
    shareHex64: shareWrong,
  });
  const deps = makeDeps({ smgSc, gpkSc });

  const out = await checkValid({
    groupId: "0x01",
    smgAddr: "smg",
    gpkAddr: "gpk",
    rpcUrl: "http://mock",
    deps,
  });

  assert.equal(out.gpkCount, 1);
  assert.equal(out.smNumber, 1);
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0][gpkExpected], false);
});

test(
  "integration: onchain gpk tampered should mismatch recovered (expect false)",
  { skip: process.env.RUN_CHAIN_TEST ? false : "set RUN_CHAIN_TEST=1 to run" },
  async () => {
    const rpcUrl = "https://gwan-ssl.wandevs.org:46891";
    const groupId = "0x000000000000000000000000000000000000000000000000006465765f333031";
    const smgAddr = "0xaA5A0f7F99FA841F410aafD97E8C435c75c22821";
    const gpkAddr = "0xf0bFfF373EEF7b787f5aecb808A59dF714e2a6E7";

    let tamperedGpk = null;
    const deps = {
      gpkTransformer: (g, { index }) => {
        if (index !== 0) return g;
        const s = String(g);
        if (!s.startsWith("0x") || s.length < 4) return g;
        const c = s[2] === "0" ? "1" : "0";
        tamperedGpk = "0x" + c + s.slice(3);
        return tamperedGpk;
      },
    };

    const out = await checkValid({ groupId, smgAddr, gpkAddr, rpcUrl, deps });
    assert.equal(out.results.length, 1);

    assert.ok(tamperedGpk);
    assert.equal(out.results[0][tamperedGpk], false);
  }
);

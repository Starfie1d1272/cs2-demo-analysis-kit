// Original upstream packages remain the sole source of schema/formula semantics.
// Pin runtime and declaration dependencies together; only compile their registry bytes.
export const bundledDependencies = {
  "cs2-demo-format": {
    "version": "3.1.0",
    "file": "cs2-demo-format.js",
    "license": "cs2-demo-format.LICENSE",
    "licenseSha256": "b0aa7086ca919451b7ec7e7ef8b2f4b4de354770bda77e1e830b734aa9798def",
    "tarball": "https://registry.npmjs.org/cs2-demo-format/-/cs2-demo-format-3.1.0.tgz",
    "integrity": "sha512-o998DZl5slsTPYea4hUdJ/S6b2TE4joIuslO8E2X7k+Dazd63guf1o2EftGlZb2CD2uzn2sILLM4tIAreNgu6w==",
    "licenseSource": "https://github.com/Starfie1d1272/cs2-demo-format/blob/aea485d8163e1b0caa729157cf2f137159a94ff0/LICENSE",
    "sourceHashes": {
      "parser/index.ts": "be454cb7fd24560aa8daf97523d01473978a2e94340dcce67d79a73633b87ddb",
      "schemas/index.ts": "10191d8cf14ddb5b089a9ed2598bcddc2e05f464ddc5898c6e24a04c46c1c1af"
    }
  },
  "@rivalhub/rival-rating": {
    "version": "0.3.0",
    "file": "rival-rating.js",
    "license": "rival-rating.LICENSE",
    "licenseSha256": "b0aa7086ca919451b7ec7e7ef8b2f4b4de354770bda77e1e830b734aa9798def",
    "tarball": "https://registry.npmjs.org/@rivalhub/rival-rating/-/rival-rating-0.3.0.tgz",
    "integrity": "sha512-EP2XgFC7IFxrkuM0a+Za0TZEoW+OU3he5KC6J+D1CLLnneXS391wgVzq5Gj1/j6sWck3btkPgAH+jst3Ax7xrA==",
    "licenseSource": "https://github.com/Starfie1d1272/rival-rating/blob/17b565f0f826b0b9f78548e9059d8a572b922182/LICENSE",
    "sourceHashes": {
      "src/index.ts": "466f53a55890e93295e6d70e9277b3a0134ef75d0e9cb7d8114864b31b1cc0e4",
      "src/prism/compute.ts": "23e5aacdbafbc0473fcff8e4aa2dffd4c8c66cd6c47076c02b70ed7975445cd6",
      "src/prism/extract.ts": "ecba1e0639df914255f12d14215e1c20a46ec845bcb6aaad46ea612689dc9360",
      "src/prism/zscore.ts": "d5a1cc1d988dacf365d242ea6a9ae8e8cd92c7325192614568ec954008e115f8",
      "src/rr/compute.ts": "4ed2077dbf32c1ab68303f37301a7646107af4f58226e4ab8c0015f676bf1ef9",
      "src/rr/models/cohort-accounts.ts": "01c92044f3d6a9d5024d162f81e7242ea8d23a7df46a6e87ee6457fd3c1d7b09",
      "src/rr/models/frozen-pro-baseline.ts": "ed74a5adfe0be0618269d207c194bf4b441e540eb1cacad9dc207b01c69a6079",
      "src/rr/models/hltv-linear-v1.ts": "ea5106046ba041248717fdc9d38d4ca0d7194fa5b77c4b0677e19641cc99620a",
      "src/rr/models/six-accounts.ts": "5f442d3de19bbde1d7f29302583cdaaf71e4777e3e4c5ad1b22b88aebe807ae7",
      "src/types/accounts.ts": "212883b8c7131b7d77da8546012c78fa42712257067b4734eb464e0ea02d4bb5",
      "src/types/indicators.ts": "baa75a17214083bdf636d6cca1d7c876da6de689fe3c8cbb8842d2a9c60bc7a1",
      "src/types/prism.ts": "76fe79a34a7aad4a86cdb0745a9a4c9f7f148e9ae9f819bcbd0eea2e3f76e561",
      "src/types/rr.ts": "a77d3e192b3d0a58fd6e41ad23c861f789e510bd063e614d958026b3805a8497",
      "src/weights/hltv-2-baseline-v1.json": "c1cbf98ab06dbc2255fb4b24dfd16adc5c847ca82f577bb2761fa87db14e68ce",
      "src/weights/prism-v1.json": "eaf2531c23dcc988407649c2c00c1ea60692d2cc24a3afa4c941475aa49b41dc",
      "src/weights/rr-six-account-pro-baseline-v0.json": "143415ab6eed5b1e28c7f39f54889a90aa303b5e8d98a1541f731aa00fef5fea",
      "src/weights/rr-six-accounts-v1.json": "40097941de49074321cd7525a4b11c875422ca30992b18844e5e0f8ff84bca24"
    }
  }
};

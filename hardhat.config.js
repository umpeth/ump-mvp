require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomiclabs/hardhat-solhint");
const dotenv = require("dotenv");

const result = dotenv.config();
if (result.error) {
  console.error("Error loading .env file:", result.error);
} else {
  console.log(".env file loaded successfully");
}

console.log("INFURA_API_KEY:", process.env.INFURA_API_KEY ? "Set" : "Not Set");
console.log(
  "PRIVATE_KEY:",
  process.env.PRIVATE_KEY
    ? "Set (length: " + process.env.PRIVATE_KEY.length + ")"
    : "Not Set",
);

const rpcUrl = process.env.INFURA_API_KEY
  ? `https://base-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`
  : "https://base-mainnet.infura.io/v3/YOUR-PROJECT-ID";

console.log("RPC URL:", rpcUrl);

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    basemainnet: {
      url: rpcUrl,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
    },
  },
  etherscan: {
    apiKey: {
      base: process.env.BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40000,
  },
};

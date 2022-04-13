import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/config";

import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";

dotenv.config();

const solcVersion = "0.8.13";

// Compilation settings are overridden for large contracts to allow them to compile without going over the bytecode
// limit.

const config: HardhatUserConfig = {
  solidity: { compilers: [{ version: solcVersion, settings: { optimizer: { enabled: true, runs: 1000000 } } }] },
  networks: { hardhat: { accounts: { accountsBalance: "1000000000000000000000000" } } },
  gasReporter: { enabled: process.env.REPORT_GAS !== undefined, currency: "USD" },
  etherscan: { apiKey: { mainnet: process.env.ETHERSCAN_API_KEY } },
};

export default config;

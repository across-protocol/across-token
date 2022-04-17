"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.advanceTime =
  exports.seedAndApproveWallet =
  exports.toBN =
  exports.fromWei =
  exports.toWei =
  exports.getContractFactory =
  exports.Signer =
  exports.BigNumber =
  exports.hre =
  exports.ethers =
  exports.Contract =
  exports.expect =
    void 0;
const chai_1 = __importDefault(require("chai"));
const ethereum_waffle_1 = require("ethereum-waffle");
chai_1.default.use(ethereum_waffle_1.solidity);
const chai_2 = require("chai");
Object.defineProperty(exports, "expect", {
  enumerable: true,
  get: function () {
    return chai_2.expect;
  },
});
const hardhat_1 = __importDefault(require("hardhat"));
exports.hre = hardhat_1.default;
const hardhat_2 = require("hardhat");
Object.defineProperty(exports, "ethers", {
  enumerable: true,
  get: function () {
    return hardhat_2.ethers;
  },
});
const ethers_1 = require("ethers");
Object.defineProperty(exports, "BigNumber", {
  enumerable: true,
  get: function () {
    return ethers_1.BigNumber;
  },
});
Object.defineProperty(exports, "Signer", {
  enumerable: true,
  get: function () {
    return ethers_1.Signer;
  },
});
Object.defineProperty(exports, "Contract", {
  enumerable: true,
  get: function () {
    return ethers_1.Contract;
  },
});
async function getContractFactory(name, signerOrFactoryOptions) {
  try {
    // First, try get the artifact from this repo.
    return await hardhat_2.ethers.getContractFactory(name, signerOrFactoryOptions);
  } catch (_) {
    throw new Error(`Could not find the artifact for ${name}!`);
  }
}
exports.getContractFactory = getContractFactory;
const toWei = (num) => hardhat_2.ethers.utils.parseEther(num.toString());
exports.toWei = toWei;
const fromWei = (num) => hardhat_2.ethers.utils.formatUnits(num.toString());
exports.fromWei = fromWei;
const toBN = (num) => {
  // If the string version of the num contains a `.` then it is a number which needs to be parsed to a string int.
  if (num.toString().includes(".")) return ethers_1.BigNumber.from(parseInt(num.toString()));
  return ethers_1.BigNumber.from(num.toString());
};
exports.toBN = toBN;
const constants_1 = require("./constants");
async function seedAndApproveWallet(wallet, tokens, approvalTarget, amountToMint = constants_1.seedWalletAmount) {
  for (const token of tokens) {
    await token.mint(wallet.address, amountToMint);
    await token.connect(wallet).approve(approvalTarget.address, constants_1.safeMaxApprove);
  }
}
exports.seedAndApproveWallet = seedAndApproveWallet;
async function advanceTime(timer, amount) {
  await timer.setCurrentTime(Number(await timer.getCurrentTime()) + amount);
}
exports.advanceTime = advanceTime;

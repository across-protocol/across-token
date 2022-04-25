"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rewardsLockingDistributorFixture = void 0;
const utils_1 = require("./utils");
exports.rewardsLockingDistributorFixture = utils_1.hre.deployments.createFixture(async ({ ethers }) => {
  const [deployerWallet] = await ethers.getSigners();
  const timer = await (await (0, utils_1.getContractFactory)("Timer", deployerWallet)).deploy();
  const acrossToken = await (await (0, utils_1.getContractFactory)("AcrossToken", deployerWallet)).deploy();
  const distributor = await (
    await (0, utils_1.getContractFactory)("RewardsLockingDistributor", deployerWallet)
  ).deploy(acrossToken.address, timer.address);
  const lpToken1 = await (
    await (0, utils_1.getContractFactory)("TestToken", deployerWallet)
  ).deploy("LP1", "LP Token 1");
  const lpToken2 = await (
    await (0, utils_1.getContractFactory)("TestToken", deployerWallet)
  ).deploy("LP2", "LP Token 2");
  return { timer, acrossToken, distributor, lpToken1, lpToken2 };
});

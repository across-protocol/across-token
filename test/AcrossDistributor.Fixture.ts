import { getContractFactory, SignerWithAddress, Contract, hre, ethers, BigNumber } from "./utils";

export const acrossDistributorFixture = hre.deployments.createFixture(async ({ ethers }) => {
  const [deployerWallet] = await ethers.getSigners();

  const timer = await (await getContractFactory("Timer", deployerWallet)).deploy();

  const acrossToken = await (await getContractFactory("AcrossToken", deployerWallet)).deploy();

  const distributor = await (
    await getContractFactory("AcrossDistributor", deployerWallet)
  ).deploy(acrossToken.address, timer.address);

  const lpToken1 = await (await getContractFactory("TestToken", deployerWallet)).deploy("LP1", "LP Token 1");
  const lpToken2 = await (await getContractFactory("TestToken", deployerWallet)).deploy("LP2", "LP Token 2");

  return { timer, acrossToken, distributor, lpToken1, lpToken2 };
});

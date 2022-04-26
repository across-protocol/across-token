import "hardhat-deploy";
import { HardhatRuntimeEnvironment } from "hardhat/types/runtime";

const func = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const AcrossToken = await deployments.getOrNull("AcrossToken");

  await deploy("AcceleratingDistributor", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [AcrossToken.address, "0x0000000000000000000000000000000000000000"],
  });
};

module.exports = func;
func.tags = ["AcceleratingDistributor", "mainnet"];

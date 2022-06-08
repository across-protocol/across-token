import "hardhat-deploy";
import { HardhatRuntimeEnvironment } from "hardhat/types/runtime";

const func = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const AcrossToken = await deployments.get("AcrossToken");

  await deploy("AcceleratingDistributor", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [AcrossToken.address],
  });
};

module.exports = func;
func.tags = ["AcceleratingDistributor", "mainnet"];

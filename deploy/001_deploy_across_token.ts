import "hardhat-deploy";
import { HardhatRuntimeEnvironment } from "hardhat/types/runtime";

const func = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  await deploy("rewardToken", { from: deployer, log: true, skipIfAlreadyDeployed: true });
};

module.exports = func;
func.tags = ["rewardToken", "mainnet"];

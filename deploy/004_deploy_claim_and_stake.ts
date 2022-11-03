import "hardhat-deploy";
import { HardhatRuntimeEnvironment } from "hardhat/types/runtime";

const func = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const merkleDistributor = await deployments.get("AcrossMerkleDistributor");
  const acceleratingDistributor = await deployments.get("AcceleratingDistributor");

  await deploy("ClaimAndStake", {
    from: deployer,
    log: true,
    skipIfAlreadyDeployed: true,
    args: [merkleDistributor.address, acceleratingDistributor.address],
  });
};

module.exports = func;
func.tags = ["ClaimAndStake", "mainnet"];

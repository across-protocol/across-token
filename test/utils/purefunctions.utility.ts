import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber, Signer, Contract, ContractFactory } from "ethers";
import hre, { ethers } from "hardhat";
import { FactoryOptions } from "hardhat/types";

chai.use(solidity);
export interface SignerWithAddress extends Signer {
  address: string;
}

export async function getContractFactory(
  name: string,
  signerOrFactoryOptions: Signer | FactoryOptions
): Promise<ContractFactory> {
  try {
    // First, try get the artifact from this repo.
    return await ethers.getContractFactory(name, signerOrFactoryOptions);
  } catch (_) {
    throw new Error(`Could not find the artifact for ${name}!`);
  }
}

export const toWei = (num: string | number | BigNumber) => ethers.utils.parseEther(num.toString());

export const fromWei = (num: string | number | BigNumber) => ethers.utils.formatUnits(num.toString());

export const toBN = (num: string | number | BigNumber) => {
  // If the string version of the num contains a `.` then it is a number which needs to be parsed to a string int.
  if (num.toString().includes(".")) return BigNumber.from(parseInt(num.toString()));
  return BigNumber.from(num.toString());
};

export async function advanceTime(timer: Contract, amount: number) {
  await timer.setCurrentTime(Number(await timer.getCurrentTime()) + amount);
}

export { expect, Contract, ethers, hre, BigNumber, Signer };

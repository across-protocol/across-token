import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import hre, { ethers } from "hardhat";
import { BigNumber, Signer, Contract, ContractFactory } from "ethers";
import { FactoryOptions } from "hardhat/types";

import { safeMaxApprove, seedWalletAmount } from "./constants";
chai.use(solidity);

export { expect, Contract, ethers, hre, BigNumber, Signer };

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

export async function seedAndApproveWallet(
  wallet: SignerWithAddress,
  tokens: Contract[],
  approvalTarget: Contract,
  amountToMint: BigNumber = seedWalletAmount
) {
  for (const token of tokens) {
    await token.mint(wallet.address, amountToMint);
    await token.connect(wallet).approve(approvalTarget.address, safeMaxApprove);
  }
}

export async function advanceTime(timer: Contract, amount: number) {
  await timer.setCurrentTime(Number(await timer.getCurrentTime()) + amount);
}

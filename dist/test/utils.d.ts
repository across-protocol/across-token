import { expect } from "chai";
import hre from "hardhat";
import { ethers } from "hardhat";
import { BigNumber, Signer, Contract, ContractFactory } from "ethers";
import { FactoryOptions } from "hardhat/types";
export { expect, Contract, ethers, hre, BigNumber, Signer };
export interface SignerWithAddress extends Signer {
  address: string;
}
export declare function getContractFactory(
  name: string,
  signerOrFactoryOptions: Signer | FactoryOptions
): Promise<ContractFactory>;
export declare const toWei: (num: string | number | BigNumber) => BigNumber;
export declare const fromWei: (num: string | number | BigNumber) => string;
export declare const toBN: (num: string | number | BigNumber) => BigNumber;
export declare function seedAndApproveWallet(
  wallet: SignerWithAddress,
  tokens: Contract[],
  approvalTarget: Contract,
  amountToMint?: BigNumber
): Promise<void>;
export declare function advanceTime(timer: Contract, amount: number): Promise<void>;

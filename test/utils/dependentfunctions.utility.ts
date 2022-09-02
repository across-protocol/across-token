// This file represents functions that require a lookup from constants.ts
// This seems to be calling a circular reference on constants.ts that prevents
// tsc from defining adequate values for several key functions in utilities

import { seedWalletAmount, safeMaxApprove } from "../constants";
import { BigNumber, Contract, SignerWithAddress } from ".";

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

import { BigNumber, toWei } from "./utils";

export const baseEmissionRate: BigNumber = toWei(0.01); // Protocol should release 0.01 tokens per second.

export const maxMultiplier: BigNumber = toWei(5); // At maximum recipient can earn 5x the base rate.

export const secondsToMaxMultiplier = 1000; // it should take 1000 seconds to reach the max multiplier.

export const seedDistributorAmount: BigNumber = toWei(100000);

export const seedWalletAmount: BigNumber = toWei(1000);

export const stakeAmount: BigNumber = toWei(10);

export const safeMaxApprove = "79228162514264337593543950335";

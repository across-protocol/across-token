import { BigNumber, toWei } from "./utils";

export const baseEmissionRate = toWei(0.01); // Protocol should release 0.01 tokens per second.

export const maxMultiplier = toWei(5); // At maximum recipient can earn 5x the base rate.

export const secondsToMaxMultiplier = 1000; // it should take 1000 seconds to reach the max multiplier.

export const seedDistributorAmount = toWei(100000);

export const seedWalletAmount = toWei(1000);

export const stakeAmount = toWei(10);

export const safeMaxApprove = "79228162514264337593543950335";

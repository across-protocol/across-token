"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeMaxApprove =
  exports.seedWalletAmount =
  exports.seedDistributorAmount =
  exports.secondsToMaxMultiplier =
  exports.maxMultiplier =
  exports.baseEmissionRate =
    void 0;
const utils_1 = require("./utils");
exports.baseEmissionRate = (0, utils_1.toWei)(0.01); // Protocol should release 0.01 tokens per second.
exports.maxMultiplier = (0, utils_1.toWei)(5); // At maximum recipient can earn 5x the base rate.
exports.secondsToMaxMultiplier = 1000; // it should take 1000 seconds to reach the max multiplier.
exports.seedDistributorAmount = (0, utils_1.toWei)(100000);
exports.seedWalletAmount = (0, utils_1.toWei)(100);
exports.safeMaxApprove = "79228162514264337593543950335";

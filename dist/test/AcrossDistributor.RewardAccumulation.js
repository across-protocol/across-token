"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const RewardsLockingDistributor_Fixture_1 = require("./RewardsLockingDistributor.Fixture");
const constants_1 = require("./constants");
let timer, acrossToken, distributor, lpToken1;
let owner, depositor1, depositor2;
const stakeAmount = (0, utils_1.toWei)(10);
describe("RewardsLockingDistributor: Staking Rewards", async function () {
  beforeEach(async function () {
    [owner, depositor1, depositor2] = await utils_1.ethers.getSigners();
    ({ timer, distributor, acrossToken, lpToken1 } = await (0,
    RewardsLockingDistributor_Fixture_1.rewardsLockingDistributorFixture)());
    // Enable the LpToken for staking and deposit some across tokens into the distributor.
    await distributor.enableStaking(
      lpToken1.address,
      true,
      constants_1.baseEmissionRate,
      constants_1.maxMultiplier,
      constants_1.secondsToMaxMultiplier
    );
    await acrossToken.mint(distributor.address, constants_1.seedDistributorAmount);
    await (0, utils_1.seedAndApproveWallet)(depositor1, [lpToken1], distributor);
    await (0, utils_1.seedAndApproveWallet)(depositor2, [lpToken1], distributor);
  });
  it("Single depositor outstanding reward accumulation", async function () {
    (0, utils_1.expect)(await lpToken1.balanceOf(distributor.address)).to.equal((0, utils_1.toBN)(0));
    await (0, utils_1.expect)(() => distributor.connect(depositor1).stake(lpToken1.address, stakeAmount))
      // Token balances should change as expected
      .to.changeTokenBalances(lpToken1, [distributor, depositor1], [stakeAmount, stakeAmount.mul(-1)]);
    // Should have correct staked amount.
    (0, utils_1.expect)(await distributor.getCumulativeStakingBalance(lpToken1.address, depositor1.address)).to.equal(
      stakeAmount
    );
    // As no time has elapsed the rewards entitled to the user should be 0.
    (0, utils_1.expect)(await distributor.outstandingRewards(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toBN)(0)
    );
    // The user should start with the reward multiplier of 1.
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(1)
    );
    // The baseRewardPerToken should be set to 0 as no time has elapsed yet.
    (0, utils_1.expect)(await distributor.baseRewardPerToken(lpToken1.address)).to.equal((0, utils_1.toBN)(0));
    // Advance time forward 200 seconds. The user should be entitled to the entire amount of emissions (no pro-rata
    // split as they are the only staker) * the increase from their multiplier. They were in the pool for 2/10 of the
    // time to get to the max multiplier of 5 so the multiplier should be set to 1 + 200 / 1000 * (5 - 1) = 1.8. Therefore this
    // should be duration * baseEmissionRate * multiplier = 200 * 0.01 * 1.8 = 3.6.
    await (0, utils_1.advanceTime)(timer, 200);
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(1.8)
    );
    (0, utils_1.expect)(await distributor.outstandingRewards(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(3.6)
    );
    // The baseRewardPerToken should now be the deltaInTime * the baseEmissionRate / cumulativeStaked.
    // i.e baseRewardPerToken = 200 * 0.01 / 10 = 0.1
    (0, utils_1.expect)(await distributor.baseRewardPerToken(lpToken1.address)).to.equal((0, utils_1.toWei)(0.2));
    // Advance time forward another 800 seconds. We should now be at the max multiplier for the user of 5.
    await (0, utils_1.advanceTime)(timer, 800);
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(5)
    );
    // Rewards entitled to the user should now be duration * baseEmissionRate * multiplier as 1000 * 0.01 * 5 = 50
    (0, utils_1.expect)(await distributor.outstandingRewards(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(50)
    );
  });
  it("Single depositor, getRewards token flow", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);
    // Advance time 200 seconds. Expected rewards are 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) = 3.6 (same as pervious test).
    await (0, utils_1.advanceTime)(timer, 200);
    await (0, utils_1.expect)(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 3.6 to the depositor.
      .to.changeTokenBalances(
        acrossToken,
        [distributor, depositor1],
        [(0, utils_1.toWei)(-3.6), (0, utils_1.toWei)(3.6)]
      );
    // After claiming the rewards the users multiplier should be reset to 1.
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(1)
    );
    // Advance time 500 seconds. Expected rewards are 500 * 0.01 * (1 + 500 / 1000 * (5 - 1)) = 15.
    await (0, utils_1.advanceTime)(timer, 500);
    await (0, utils_1.expect)(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 15 to the depositor.
      .to.changeTokenBalances(
        acrossToken,
        [distributor, depositor1],
        [(0, utils_1.toWei)(-15), (0, utils_1.toWei)(15)]
      );
  });
  it.only("Single depositor, unstake token flow", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);
    // Advance time 200 seconds. Expected rewards are 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) = 3.6 (same as pervious test).
    await (0, utils_1.advanceTime)(timer, 200);
    (0, utils_1.expect)(await distributor.outstandingRewards(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(3.6)
    );
    // User unstakes. This should send back their LP tokens but seeing they did not claim any rewards their multiplier
    // should remain. They should be able to independently claim the rewards.
    await (0, utils_1.expect)(() => distributor.connect(depositor1).unstake(lpToken1.address, stakeAmount))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 0.9 to the depositor1.
      .to.changeTokenBalances(lpToken1, [distributor, depositor1], [stakeAmount.mul(-1), stakeAmount]);
  });
  it("Multiple depositors, pro-rate distribution: same stake time and claim time", async function () {
    // Create a simple situation wherein both depositors deposit at the same time but have varying amounts.
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount); // stake 10.
    await distributor.connect(depositor2).stake(lpToken1.address, stakeAmount.mul(3)); // stake 30.
    // Advance time 200 seconds. The total emission for this period (split between the two depositors) is
    // 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) = 3.6. Depositor 1 should get 10 / 40 * 3.6 = 1.2 and depositor2 should
    // get 20 / 40 * 3.6 = 2.7. Equally, both should have the same multiplier of 1 + 200 / 1000 *(5 - 1) = 1.8
    await (0, utils_1.advanceTime)(timer, 200);
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(1.8)
    );
    await (0, utils_1.expect)(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 0.9 to the depositor1.
      .to.changeTokenBalances(
        acrossToken,
        [distributor, depositor1],
        [(0, utils_1.toWei)(-0.9), (0, utils_1.toWei)(0.9)]
      );
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor2.address)).to.equal(
      (0, utils_1.toWei)(1.8)
    );
    await (0, utils_1.expect)(() => distributor.connect(depositor2).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 2.7 to the depositor2.
      .to.changeTokenBalances(
        acrossToken,
        [distributor, depositor2],
        [(0, utils_1.toWei)(-2.7), (0, utils_1.toWei)(2.7)]
      );
  });
  it("Multiple depositors, pro-rate distribution: same stake time and separate claim time", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount); // stake 10.
    await distributor.connect(depositor2).stake(lpToken1.address, stakeAmount.mul(3)); // stake 30.
    // Try claiming from one user halfway through some staking period and validating that multipliers are treated independently.
    await (0, utils_1.advanceTime)(timer, 200);
    // Both depositors should have the same multiplier of 1 + 200 / 1000 *(5 - 1) = 1.8.
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(1.8)
    );
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor2.address)).to.equal(
      (0, utils_1.toWei)(1.8)
    );
    // Claim on just depositor2.
    await distributor.connect(depositor2).getReward(lpToken1.address);
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(1.8)
    );
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor2.address)).to.equal(
      (0, utils_1.toWei)(1)
    );
    // Advance time another 300 seconds. Now, Depositor1 should have a multiplier of 1 + 300 / 1000 * (5 - 1) = 3 and
    // Depositor2 have 1 + 300 / 1000 * (5 - 1) = 2.2 as they reset their multiplier halfway through due to the claiming.
    await (0, utils_1.advanceTime)(timer, 300);
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(3)
    );
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor2.address)).to.equal(
      (0, utils_1.toWei)(2.2)
    );
    // Depositor1 should now be entitled to 1/4 of the rewards accumulated over the period, multiplied by their multiplier.
    // This should be 500 * 0.01 * 3 * 1/4 = 3.75.
    await (0, utils_1.expect)(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 3.75 to the depositor1.
      .to.changeTokenBalances(
        acrossToken,
        [distributor, depositor1],
        [(0, utils_1.toWei)(-3.75), (0, utils_1.toWei)(3.75)]
      );
    // Depositor2 should be entitled to 3/4th of of the rewards, accumulated from the previous time they claimed, multiple
    // by their reduced multiplier. This should be 300 * 0.01 * 2.2 * 3/4 = 4.95
    await (0, utils_1.expect)(() => distributor.connect(depositor2).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 4.49 to the depositor2.
      .to.changeTokenBalances(
        acrossToken,
        [distributor, depositor2],
        [(0, utils_1.toWei)(-4.95), (0, utils_1.toWei)(4.95)]
      );
  });
  it("Multiple depositors, pro-rate distribution: separate stake time and separate claim time", async function () {
    // Stake with one user, advance time, then stake with another use. We should be able to track the evaluation of the
    // pro-rate rewards, as expected.
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount); // stake 10.
    await (0, utils_1.advanceTime)(timer, 200);
    // User outstanding rewards should be the base emotion rate * multiplier exclusively allocated to them as
    // 200 * 0.01 * (1+ 200 / 1000 * (5 - 1)) = 3.6.
    (0, utils_1.expect)(await distributor.outstandingRewards(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(3.6)
    );
    // Now, the second depositor comes in.
    await distributor.connect(depositor2).stake(lpToken1.address, stakeAmount.mul(3)); // stake 30.
    // Advance time another 200 seconds.
    await (0, utils_1.advanceTime)(timer, 200);
    // Now, the depositor1 should be entitled to their first amount + the pro-rate rewards for the second period as
    // 400 * 0.01 * (1 + 400 / 1000 * (5 - 1)) * (1 / 4 + 1) / 2 = 6.5. This equation can be though as attributing the
    // full period plus the multiplier growing over the full period * (1 / 4 + 1) / 2 which represents that for the first
    // 200 seconds the pro-rate decision is 1 (i.e (1)/2) and for the second 200 seconds it is 1/4 (i.e (1/4)/2).
    (0, utils_1.expect)(await distributor.outstandingRewards(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(6.5)
    );
    // The depositor2 balance should simply be their prop-rate share of the distribution drawn over the 200 seconds as
    // 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) * 3/4 = 2.7.
    (0, utils_1.expect)(await distributor.outstandingRewards(lpToken1.address, depositor2.address)).to.equal(
      (0, utils_1.toWei)(2.7)
    );
  });
  it("Advance time past secondsToMaxMultiplier should cap the multiplier at maxMultiplier", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount); // stake 10.
    await (0, utils_1.advanceTime)(timer, 200);
    // Depositor should have the same multiplier of 1 + 200 / 1000 *(5 - 1) = 1.8.
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(
      (0, utils_1.toWei)(1.8)
    );
    // Advance time to the max secondsToMaxMultiplier (another 800). Multiplier should equal the max multiplier.
    await (0, utils_1.advanceTime)(timer, 800);
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(
      constants_1.maxMultiplier
    );
    //  Advancing time past now should not increase the multiplier any further.
    await (0, utils_1.advanceTime)(timer, 1000);
    (0, utils_1.expect)(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(
      constants_1.maxMultiplier
    );
  });
});

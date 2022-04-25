import { expect, ethers, Contract, SignerWithAddress, toWei, seedAndApproveWallet, toBN, advanceTime } from "./utils";
import { rewardsLockingDistributorFixture, enableTokenForStaking } from "./RewardsLockingDistributor.Fixture";
import { maxMultiplier, stakeAmount } from "./constants";

let timer: Contract, acrossToken: Contract, distributor: Contract, lpToken1: Contract;
let owner: SignerWithAddress, depositor1: SignerWithAddress, depositor2: SignerWithAddress;

describe("RewardsLockingDistributor: Staking Rewards", async function () {
  beforeEach(async function () {
    [owner, depositor1, depositor2] = await ethers.getSigners();
    ({ timer, distributor, acrossToken, lpToken1 } = await rewardsLockingDistributorFixture());
    await enableTokenForStaking(distributor, lpToken1, acrossToken);
    await seedAndApproveWallet(depositor1, [lpToken1], distributor);
    await seedAndApproveWallet(depositor2, [lpToken1], distributor);
  });
  it("Single depositor outstanding reward accumulation", async function () {
    expect(await lpToken1.balanceOf(distributor.address)).to.equal(toBN(0));

    await expect(() => distributor.connect(depositor1).stake(lpToken1.address, stakeAmount))
      // Token balances should change as expected
      .to.changeTokenBalances(lpToken1, [distributor, depositor1], [stakeAmount, stakeAmount.mul(-1)]);
    // Should have correct staked amount.
    expect((await distributor.getUserStake(lpToken1.address, depositor1.address)).cumulativeBalance).to.equal(
      stakeAmount
    );

    // As no time has elapsed the rewards entitled to the user should be 0.
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toBN(0));

    // The user should start with the reward multiplier of 1.
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1));

    // The baseRewardPerToken should be set to 0 as no time has elapsed yet.
    expect(await distributor.baseRewardPerToken(lpToken1.address)).to.equal(toBN(0));

    // Advance time forward 200 seconds. The user should be entitled to the entire amount of emissions (no pro-rata
    // split as they are the only staker) * the increase from their multiplier. They were in the pool for 2/10 of the
    // time to get to the max multiplier of 5 so the multiplier should be set to 1 + 200 / 1000 * (5 - 1) = 1.8. Therefore this
    // should be duration * baseEmissionRate * multiplier = 200 * 0.01 * 1.8 = 3.6.
    await advanceTime(timer, 200);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1.8));
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(3.6));

    // The baseRewardPerToken should now be the deltaInTime * the baseEmissionRate / cumulativeStaked.
    // i.e baseRewardPerToken = 200 * 0.01 / 10 = 0.1
    expect(await distributor.baseRewardPerToken(lpToken1.address)).to.equal(toWei(0.2));

    // Advance time forward another 800 seconds. We should now be at the max multiplier for the user of 5.
    await advanceTime(timer, 800);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(5));
    // Rewards entitled to the user should now be duration * baseEmissionRate * multiplier as 1000 * 0.01 * 5 = 50
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(50));
  });
  it("Multiple depositors, pro-rate distribution: same stake time and claim time", async function () {
    // Create a simple situation wherein both depositors deposit at the same time but have varying amounts.
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount); // stake 10.
    await distributor.connect(depositor2).stake(lpToken1.address, stakeAmount.mul(3)); // stake 30.

    // Advance time 200 seconds. The total emission for this period (split between the two depositors) is
    // 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) = 3.6. Depositor 1 should get 10 / 40 * 3.6 = 1.2 and depositor2 should
    // get 20 / 40 * 3.6 = 2.7. Equally, both should have the same multiplier of 1 + 200 / 1000 *(5 - 1) = 1.8
    await advanceTime(timer, 200);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1.8));
    await expect(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 0.9 to the depositor1.
      .to.changeTokenBalances(acrossToken, [distributor, depositor1], [toWei(-0.9), toWei(0.9)]);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor2.address)).to.equal(toWei(1.8));
    await expect(() => distributor.connect(depositor2).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 2.7 to the depositor2.
      .to.changeTokenBalances(acrossToken, [distributor, depositor2], [toWei(-2.7), toWei(2.7)]);
  });
  it("Multiple depositors, pro-rate distribution: same stake time and separate claim time", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount); // stake 10.
    await distributor.connect(depositor2).stake(lpToken1.address, stakeAmount.mul(3)); // stake 30.
    // Try claiming from one user halfway through some staking period and validating that multipliers are treated independently.
    await advanceTime(timer, 200);
    // Both depositors should have the same multiplier of 1 + 200 / 1000 *(5 - 1) = 1.8.
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1.8));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor2.address)).to.equal(toWei(1.8));

    // Claim on just depositor2.
    await distributor.connect(depositor2).getReward(lpToken1.address);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1.8));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor2.address)).to.equal(toWei(1));

    // Advance time another 300 seconds. Now, Depositor1 should have a multiplier of 1 + 300 / 1000 * (5 - 1) = 3 and
    // Depositor2 have 1 + 300 / 1000 * (5 - 1) = 2.2 as they reset their multiplier halfway through due to the claiming.
    await advanceTime(timer, 300);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(3));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor2.address)).to.equal(toWei(2.2));

    // Depositor1 should now be entitled to 1/4 of the rewards accumulated over the period, multiplied by their multiplier.
    // This should be 500 * 0.01 * 3 * 1/4 = 3.75.
    await expect(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 3.75 to the depositor1.
      .to.changeTokenBalances(acrossToken, [distributor, depositor1], [toWei(-3.75), toWei(3.75)]);
    // Depositor2 should be entitled to 3/4th of of the rewards, accumulated from the previous time they claimed, multiple
    // by their reduced multiplier. This should be 300 * 0.01 * 2.2 * 3/4 = 4.95
    await expect(() => distributor.connect(depositor2).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 4.49 to the depositor2.
      .to.changeTokenBalances(acrossToken, [distributor, depositor2], [toWei(-4.95), toWei(4.95)]);
  });
  it("Multiple depositors, pro-rate distribution: separate stake time and separate claim time", async function () {
    // Stake with one user, advance time, then stake with another use. We should be able to track the evaluation of the
    // pro-rate rewards, as expected.

    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount); // stake 10.
    await advanceTime(timer, 200);

    // User outstanding rewards should be the base emotion rate * multiplier exclusively allocated to them as
    // 200 * 0.01 * (1+ 200 / 1000 * (5 - 1)) = 3.6.
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(3.6));

    // Now, the second depositor comes in.
    await distributor.connect(depositor2).stake(lpToken1.address, stakeAmount.mul(3)); // stake 30.

    // Advance time another 200 seconds.
    await advanceTime(timer, 200);

    // Now, the depositor1 should be entitled to their first amount + the pro-rate rewards for the second period as
    // 400 * 0.01 * (1 + 400 / 1000 * (5 - 1)) * (1 / 4 + 1) / 2 = 6.5. This equation can be though as attributing the
    // full period plus the multiplier growing over the full period * (1 / 4 + 1) / 2 which represents that for the first
    // 200 seconds the pro-rate decision is 1 (i.e (1)/2) and for the second 200 seconds it is 1/4 (i.e (1/4)/2).
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(6.5));

    // The depositor2 balance should simply be their prop-rate share of the distribution drawn over the 200 seconds as
    // 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) * 3/4 = 2.7.
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor2.address)).to.equal(toWei(2.7));
  });
});

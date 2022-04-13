import { expect, ethers, Contract, SignerWithAddress, toWei, seedAndApproveWallet, toBN, advanceTime } from "./utils";
import { acrossDistributorFixture } from "./AcrossDistributor.Fixture";
import { baseEmissionRate, maxMultiplier, secondsToMaxMultiplier, seedDistributorAmount } from "./constants";

let timer: Contract, acrossToken: Contract, distributor: Contract, lpToken1: Contract;
let owner: SignerWithAddress, depositor1: SignerWithAddress, depositor2: SignerWithAddress;

const stakeAmount = toWei(10);

describe("AcrossDistributor: Staking Rewards", async function () {
  beforeEach(async function () {
    [owner, depositor1, depositor2] = await ethers.getSigners();
    ({ timer, distributor, acrossToken, lpToken1 } = await acrossDistributorFixture());

    // Enable the LpToken for staking and deposit some across tokens into the distributor.
    await distributor.enableStaking(lpToken1.address, true, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier);
    await acrossToken.mint(distributor.address, seedDistributorAmount);

    await seedAndApproveWallet(depositor1, [lpToken1], distributor);
    await seedAndApproveWallet(depositor2, [lpToken1], distributor);
  });
  it("Single depositor outstanding reward accumulation", async function () {
    expect(await lpToken1.balanceOf(distributor.address)).to.equal(toBN(0));

    await expect(() => distributor.connect(depositor1).stake(lpToken1.address, stakeAmount))
      // Token balances should change as expected
      .to.changeTokenBalances(lpToken1, [distributor, depositor1], [stakeAmount, stakeAmount.mul(-1)]);
    // Should have correct staked amount.
    expect(await distributor.getCumulativeStakingBalance(lpToken1.address, depositor1.address)).to.equal(stakeAmount);

    // As no time has elapsed the rewards entitled to the user should be 0.
    expect(await distributor.outstandingRewards(lpToken1.address, depositor1.address)).to.equal(toBN(0));

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
    expect(await distributor.outstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(3.6));

    // The baseRewardPerToken should now be the deltaInTime * the baseEmissionRate / cumulativeStaked.
    // i.e baseRewardPerToken = 200 * 0.01 / 10 = 0.1
    expect(await distributor.baseRewardPerToken(lpToken1.address)).to.equal(toWei(0.2));

    // Advance time forward another 800 seconds. We should now be at the max multiplier for the user of 5.
    await advanceTime(timer, 800);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(5));
    // Rewards entitled to the user should now be duration * baseEmissionRate * multiplier as 1000 * 0.01 * 5 = 50
    expect(await distributor.outstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(50));
  });
  it("Single depositor, getRewards token flow", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);

    // Advance time 200 seconds. Expected rewards are 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) = 3.6 (same as pervious test).
    await advanceTime(timer, 200);

    await expect(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 3.6 to the depositor.
      .to.changeTokenBalances(acrossToken, [distributor, depositor1], [toWei(-3.6), toWei(3.6)]);

    // After claiming the rewards the users multiplier should be reset to 1.
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1));

    // Advance time 500 seconds. Expected rewards are 500 * 0.01 * (1 + 500 / 1000 * (5 -1)) = 15.
    await advanceTime(timer, 500);
    await expect(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 15 to the depositor.
      .to.changeTokenBalances(acrossToken, [distributor, depositor1], [toWei(-15), toWei(15)]);
  });
  it("Multiple depositor, pro-rata distribution: same stake and claim time", async function () {
    // Create a simple situation wherein both depositors deposit at the same time but have varying amounts.
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount); // stake 10.
    await distributor.connect(depositor2).stake(lpToken1.address, stakeAmount.mul(3)); // stake 30.

    // Advance time 200 seconds. The total emission for this period (split between the two depositors) is
    // 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) = 3.6. Depositor 1 should get 10 / 40 * 3.6 = 1.2 and depositor2 should
    // get 20 / 40 * 3.6 = 2.7. Equally, both should have the same multiplier of 1 + 200 / 1000 *(5 - 1) = 1.8
    await advanceTime(timer, 200);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1.8));
    await expect(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 1.2 to the depositor1.
      .to.changeTokenBalances(acrossToken, [distributor, depositor1], [toWei(-0.9), toWei(0.9)]);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor2.address)).to.equal(toWei(1.8));
    await expect(() => distributor.connect(depositor2).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 2.7 to the depositor2.
      .to.changeTokenBalances(acrossToken, [distributor, depositor2], [toWei(-2.7), toWei(2.7)]);
  });
  it("Multiple depositor, pro-rata distribution: same stake and separate claim time", async function () {
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
    // Depositor2 have 1 + 300 / 1000 * (5 - 1) = 2.2 as they reset their multiplier half way through due to the claiming.
    await advanceTime(timer, 300);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(3));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor2.address)).to.equal(toWei(2.2));
  });
});

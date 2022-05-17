import { expect, ethers, Contract, SignerWithAddress, toWei, seedAndApproveWallet, toBN, advanceTime } from "./utils";
import { acceleratingDistributorFixture, enableTokenForStaking } from "./AcceleratingDistributor.Fixture";
import { stakeAmount, seedWalletAmount, seedDistributorAmount } from "./constants";

let timer: Contract, rewardToken: Contract, distributor: Contract, lpToken1: Contract, depositor1: SignerWithAddress;

describe("AcceleratingDistributor: Reward Token Flow", async function () {
  beforeEach(async function () {
    [, depositor1] = await ethers.getSigners();
    ({ timer, distributor, rewardToken, lpToken1 } = await acceleratingDistributorFixture());

    await enableTokenForStaking(distributor, lpToken1, rewardToken);
    await seedAndApproveWallet(depositor1, [lpToken1], distributor);
  });

  it("Get rewards token flow", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);

    // Advance time 200 seconds. Expected rewards are 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) = 3.6.
    await advanceTime(timer, 200);

    await expect(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 3.6 to the depositor.
      .to.changeTokenBalances(rewardToken, [distributor, depositor1], [toWei(-3.6), toWei(3.6)]);

    // After claiming the rewards the users multiplier should be reset to 1.
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1));

    // Advance time 500 seconds. Expected rewards are 500 * 0.01 * (1 + 500 / 1000 * (5 - 1)) = 15.
    await advanceTime(timer, 500);
    await expect(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 15 to the depositor.
      .to.changeTokenBalances(rewardToken, [distributor, depositor1], [toWei(-15), toWei(15)]);
  });
  it("Unstake token flow", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);

    // Advance time 200 seconds. Expected rewards are 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) = 3.6.
    await advanceTime(timer, 200);
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(3.6));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1.8));

    // User unstakes. This should send back their LP tokens but seeing they did not claim any rewards their rewards
    // should remain the same. Their multiplier, however, should have rest as they unstaked everything.
    await expect(() => distributor.connect(depositor1).unstake(lpToken1.address, stakeAmount))
      // Get the LP tokens back. Check the cash flows are as expected. The distributor should send stakedAmount.
      .to.changeTokenBalances(lpToken1, [distributor, depositor1], [stakeAmount.mul(-1), stakeAmount]);
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(3.6));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1));

    // If we advance time their accumulated rewards should NOT increase as they have nothing staked.
    await advanceTime(timer, 200);
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(3.6));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1));

    // User re-stakes. As they unstaked before they've forced their multiplier back to 1. They should start accumulating
    // rewards again and their new accumulation should add to the previous one.
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(3.6));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1));

    // Advance time by 300 seconds. Expected Multiplier is 1 + 300 / 1000 * (5 - 1) = 2.2. Expected rewards are
    // 3.6 + 300 * 0.01 * 2.2 = 10.2 (i.e previous rewards + the new batch with no carry over multiplier due to reset).
    await advanceTime(timer, 300);
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(10.2));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(2.2));

    // This time unstake then claim rewards. multiplier and outstanding rewards should reset.
    await expect(() => distributor.connect(depositor1).unstake(lpToken1.address, stakeAmount))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 0.9 to the depositor1.
      .to.changeTokenBalances(lpToken1, [distributor, depositor1], [stakeAmount.mul(-1), stakeAmount]);
    await expect(() => distributor.connect(depositor1).getReward(lpToken1.address))
      // Get the rewards. Check the cash flows are as expected. The distributor should send 10.2 to the depositor1.
      .to.changeTokenBalances(rewardToken, [distributor, depositor1], [toWei(10.2).mul(-1), toWei(10.2)]);
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(0));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1));

    // Re-stake and advance time. There should be no memory of the previous stakes and rewards should accumulate from scratch.
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(0));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1));
    await advanceTime(timer, 200);
    expect(await distributor.getOutstandingRewards(lpToken1.address, depositor1.address)).to.equal(toWei(3.6));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1.8));
  });
  it("Exit token flow", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);

    // Advance time 200 seconds. Expected rewards are 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) = 3.6.
    // Exit should pull out all rewards and unstake all LP tokens. Check balances directly as there was 2 token actions.
    await advanceTime(timer, 200);
    await distributor.connect(depositor1).exit(lpToken1.address);
    expect(await lpToken1.balanceOf(distributor.address)).to.equal(toBN(0));
    expect(await lpToken1.balanceOf(depositor1.address)).to.equal(toBN(seedWalletAmount));
    const expectedRewards = toWei(3.6);
    expect(await rewardToken.balanceOf(distributor.address)).to.equal(seedDistributorAmount.sub(expectedRewards));
    expect(await rewardToken.balanceOf(depositor1.address)).to.equal(expectedRewards);
  });
});

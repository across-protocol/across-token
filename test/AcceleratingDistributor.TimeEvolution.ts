import { expect, ethers, Contract, SignerWithAddress, toWei, seedAndApproveWallet, toBN, advanceTime } from "./utils";
import { acceleratingDistributorFixture, enableTokenForStaking } from "./AcceleratingDistributor.Fixture";
import { maxMultiplier, stakeAmount } from "./constants";

let timer: Contract, acrossToken: Contract, distributor: Contract, lpToken1: Contract;
let owner: SignerWithAddress, depositor1: SignerWithAddress, depositor2: SignerWithAddress;

describe("AcceleratingDistributor: Time Evolution", async function () {
  beforeEach(async function () {
    [owner, depositor1] = await ethers.getSigners();
    ({ timer, distributor, acrossToken, lpToken1 } = await acceleratingDistributorFixture());
    await enableTokenForStaking(distributor, lpToken1, acrossToken);
    await seedAndApproveWallet(depositor1, [lpToken1], distributor);
  });
  it("Users average deposit time should update as expected", async function () {
    const time1 = await distributor.getCurrentTime();
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);

    // Advance 420 seconds and stake again at the same size. As the two deposits are of equal size we should expect to
    // see the users averageDeposit time be time1 + 210 seconds (half way between the two deposits).
    await advanceTime(timer, 420);
    const time2 = await distributor.getCurrentTime();
    expect(await distributor.getTimeFromLastDeposit(lpToken1.address, depositor1.address)).to.equal(420);
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);
    const averageDepositTime1 = time1.add(210);
    expect(time2).to.equal(time1.add(420));
    expect((await distributor.getUserStake(lpToken1.address, depositor1.address)).averageDepositTime).to.equal(
      averageDepositTime1
    );

    // Advance another 69 seconds and this time stake 10x the deposit amount. This should result in the average time
    // being closer to the current time than the previous stake time. Use the appropriate equation to compute avg time.
    await advanceTime(timer, 69);
    const time3 = await distributor.getCurrentTime();
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount.mul(10));
    const averageDepositTime2 = averageDepositTime1.add(
      stakeAmount.mul(10).mul(toWei(1)).div(stakeAmount.mul(12)).mul(time3.sub(averageDepositTime1)).div(toWei(1))
    );
    expect((await distributor.getUserStake(lpToken1.address, depositor1.address)).averageDepositTime).to.equal(
      averageDepositTime2
    );
  });

  it("Time advance should update user multiplier as expected", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);
    await advanceTime(timer, 200);

    // Depositor should have the multiplier of 1 + 200 / 1000 * (5 - 1) = 1.8.
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1.8));

    // Advance another 69 seconds. Multiplier should now be 1 + 269 / 1000 * (5 - 1) = 2.076
    await advanceTime(timer, 69);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(2.076));

    // Advance time to the max secondsToMaxMultiplier (at least 731 seconds). Multiplier should equal the max multiplier.
    await advanceTime(timer, 731);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(maxMultiplier);

    //  Advancing time past now should not increase the multiplier any further.
    await advanceTime(timer, 1000);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(maxMultiplier);
  });
  it("Partial unstake behaves as expected with reward multiplier", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);
    await advanceTime(timer, 200);

    // Depositor should have the multiplier of 1 + 200 / 1000 * (5 - 1) = 1.8.
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1.8));

    // Unstake half of the LP tokens. Should not change the multiplier.
    await distributor.connect(depositor1).unstake(lpToken1.address, stakeAmount.div(2));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1.8));

    // Multiplier should continue increasing after unstake in the same fashion. Another 200 seconds gives a multiplier
    // of 1 + 400 / 1000 * (5 - 1) = 2.6.
    await advanceTime(timer, 200);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(2.6));

    // Now, remove the rest of the LP tokens. This should reset the multiplier to 1.
    await distributor.connect(depositor1).unstake(lpToken1.address, stakeAmount.sub(stakeAmount.div(2)));
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1));

    // If the user re-stakes the LP tokens, the multiplier should be 1 with no memory of the previous stake.
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1));

    // Multiplier should now increase as per usual.
    await advanceTime(timer, 200);
    expect(await distributor.getUserRewardMultiplier(lpToken1.address, depositor1.address)).to.equal(toWei(1.8));
  });
});

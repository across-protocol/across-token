import { expect, ethers, Contract, SignerWithAddress } from "./utils";
import { toWei, advanceTime, seedAndApproveWallet, getContractFactory } from "./utils";
import { acceleratingDistributorFixture, enableTokenForStaking } from "./AcceleratingDistributor.Fixture";
import { baseEmissionRate, maxMultiplier, secondsToMaxMultiplier, stakeAmount } from "./constants";

let timer: Contract, acrossToken: Contract, distributor: Contract, lpToken1: Contract, depositor1: SignerWithAddress;
let owner: SignerWithAddress, rando: SignerWithAddress;

describe("AcceleratingDistributor: Events", async function () {
  beforeEach(async function () {
    [owner, depositor1, rando] = await ethers.getSigners();
    ({ timer, distributor, acrossToken, lpToken1 } = await acceleratingDistributorFixture());

    await enableTokenForStaking(distributor, lpToken1, acrossToken);
    await seedAndApproveWallet(depositor1, [lpToken1], distributor);
  });
  it("configureStakingToken", async function () {
    const currentTime = await distributor.getCurrentTime();
    await expect(
      distributor.configureStakingToken(lpToken1.address, true, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier)
    )
      .to.emit(distributor, "TokenConfiguredForStaking")
      .withArgs(lpToken1.address, true, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier, currentTime);
  });

  it("RecoverToken", async function () {
    const randomToken = await (await getContractFactory("TestToken", owner)).deploy("RANDO", "RANDO");
    const amount = toWei(420);
    await randomToken.mint(distributor.address, amount);
    await expect(distributor.recoverToken(randomToken.address))
      .to.emit(distributor, "RecoverToken")
      .withArgs(randomToken.address, amount);
  });
  it("Stake", async function () {
    const time1 = await distributor.getCurrentTime();

    await expect(distributor.connect(depositor1).stake(lpToken1.address, stakeAmount))
      .to.emit(distributor, "Stake")
      .withArgs(lpToken1.address, depositor1.address, stakeAmount, time1, stakeAmount, stakeAmount);

    // Subsequent stakes emit expected event. Advance time 420 seconds and stake 2x the amount.
    await advanceTime(timer, 420);
    const time2 = await distributor.getCurrentTime();
    const avgDepositTime = time1.add(
      stakeAmount.mul(2).mul(toWei(1)).div(stakeAmount.mul(3)).mul(time2.sub(time1)).div(toWei(1))
    );
    await expect(distributor.connect(depositor1).stake(lpToken1.address, stakeAmount.mul(2)))
      .to.emit(distributor, "Stake")
      .withArgs(
        lpToken1.address,
        depositor1.address,
        stakeAmount.mul(2),
        avgDepositTime,
        stakeAmount.mul(3),
        stakeAmount.mul(3)
      );
  });
  it("StakeFor", async function () {
    const time1 = await distributor.getCurrentTime();

    await expect(distributor.connect(depositor1).stakeFor(lpToken1.address, stakeAmount, rando.address))
      .to.emit(distributor, "Stake")
      .withArgs(lpToken1.address, rando.address, stakeAmount, time1, stakeAmount, stakeAmount);

    // Subsequent stakes emit expected event. Advance time 420 seconds and stake 2x the amount.
    await advanceTime(timer, 420);
    const time2 = await distributor.getCurrentTime();
    const avgDepositTime = time1.add(
      stakeAmount.mul(2).mul(toWei(1)).div(stakeAmount.mul(3)).mul(time2.sub(time1)).div(toWei(1))
    );
    await expect(distributor.connect(depositor1).stakeFor(lpToken1.address, stakeAmount.mul(2), rando.address))
      .to.emit(distributor, "Stake")
      .withArgs(
        lpToken1.address,
        rando.address,
        stakeAmount.mul(2),
        avgDepositTime,
        stakeAmount.mul(3),
        stakeAmount.mul(3)
      );
  });
  it("Unstake", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);

    // Unstake 1/3. Should see associated event.
    await expect(distributor.connect(depositor1).unstake(lpToken1.address, stakeAmount.div(3)))
      .to.emit(distributor, "Unstake")
      .withArgs(
        lpToken1.address,
        depositor1.address,
        stakeAmount.div(3),
        stakeAmount.mul(2).div(3).add(1),
        stakeAmount.mul(2).div(3).add(1)
      ); // Add 1 to deal with rounding.

    // Unstake the remaining should emit the rest.
    await expect(distributor.connect(depositor1).unstake(lpToken1.address, stakeAmount.mul(2).div(3).add(1)))
      .to.emit(distributor, "Unstake")
      .withArgs(lpToken1.address, depositor1.address, stakeAmount.mul(2).div(3).add(1), 0, 0);
  });
  it("GetRewards", async function () {
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);

    // Advance 200. should be entitled to 200 * 0.01 * (1 + 200 / 1000 * (5 - 1)) = 3.6.
    // Reward paid per token should be 200 * 0.01 or 0.2.
    await advanceTime(timer, 200);
    const currentTime = await distributor.getCurrentTime();
    await expect(distributor.connect(depositor1).withdrawReward(lpToken1.address))
      .to.emit(distributor, "RewardsWithdrawn")
      .withArgs(lpToken1.address, depositor1.address, toWei(3.6), currentTime, toWei(0.2), toWei(0.2));
  });
  it("Exit", async function () {
    // Exit calls unstake and getRewards. We've tested these events already so nothing needed on those. Just test Exit.
    await distributor.connect(depositor1).stake(lpToken1.address, stakeAmount);

    await advanceTime(timer, 200);
    await expect(distributor.connect(depositor1).exit(lpToken1.address))
      .to.emit(distributor, "Exit")
      .withArgs(lpToken1.address, depositor1.address, 0);
  });
});

import { expect, ethers, Contract, SignerWithAddress, toWei, toBN } from "./utils";
import { acceleratingDistributorFixture } from "./AcceleratingDistributor.Fixture";
import { baseEmissionRate, maxMultiplier, secondsToMaxMultiplier } from "./constants";

let timer: Contract, acrossToken: Contract, distributor: Contract, lpToken1: Contract, lpToken2: Contract;
let owner: SignerWithAddress, rando: SignerWithAddress;

describe("AcceleratingDistributor: Admin Functions", async function () {
  beforeEach(async function () {
    [owner, rando] = await ethers.getSigners();
    ({ timer, distributor, acrossToken, lpToken1 } = await acceleratingDistributorFixture());
  });
  it("Enable token for staking", async function () {
    expect((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.false;

    await distributor.enableStaking(lpToken1.address, true, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier);
    expect((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.true;
    expect((await distributor.stakingTokens(lpToken1.address)).baseEmissionRate).to.equal(baseEmissionRate);
    expect((await distributor.stakingTokens(lpToken1.address)).maxMultiplier).to.equal(maxMultiplier);
    expect((await distributor.stakingTokens(lpToken1.address)).secondsToMaxMultiplier).to.equal(secondsToMaxMultiplier);
    expect((await distributor.stakingTokens(lpToken1.address)).lastUpdateTime).to.equal(await timer.getCurrentTime());

    // Update settings.
    const newMultiplier = maxMultiplier.add(toWei(1));
    await distributor.enableStaking(lpToken1.address, true, baseEmissionRate, newMultiplier, secondsToMaxMultiplier);
    expect((await distributor.stakingTokens(lpToken1.address)).maxMultiplier).to.equal(newMultiplier);

    //Disable token for staking.
    await distributor.enableStaking(lpToken1.address, false, baseEmissionRate, newMultiplier, secondsToMaxMultiplier);
    expect((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.false;
  });

  it("Can not recover staking tokens", async function () {
    // Should not be able to recover staking tokens.
    await distributor.enableStaking(lpToken1.address, true, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier);
    await lpToken1.mint(distributor.address, toWei(420));
    await expect(distributor.recoverErc20(lpToken1.address, toWei(420))).to.be.revertedWith(
      "Can't recover staking token"
    );
  });

  it("Non owner cant execute admin functions", async function () {
    await expect(distributor.connect(rando).enableStaking(lpToken1.address, true, 4, 2, 0)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });
});

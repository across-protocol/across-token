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

    await distributor.configureStakingToken(
      lpToken1.address,
      true,
      baseEmissionRate,
      maxMultiplier,
      secondsToMaxMultiplier
    );
    expect((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.true;
    expect((await distributor.stakingTokens(lpToken1.address)).baseEmissionRate).to.equal(baseEmissionRate);
    expect((await distributor.stakingTokens(lpToken1.address)).maxMultiplier).to.equal(maxMultiplier);
    expect((await distributor.stakingTokens(lpToken1.address)).secondsToMaxMultiplier).to.equal(secondsToMaxMultiplier);
    expect((await distributor.stakingTokens(lpToken1.address)).lastUpdateTime).to.equal(await timer.getCurrentTime());

    // Update settings.
    const newMultiplier = maxMultiplier.add(toWei(1));
    await distributor.configureStakingToken(
      lpToken1.address,
      true,
      baseEmissionRate,
      newMultiplier,
      secondsToMaxMultiplier
    );
    expect((await distributor.stakingTokens(lpToken1.address)).maxMultiplier).to.equal(newMultiplier);

    //Disable token for staking.
    await distributor.configureStakingToken(
      lpToken1.address,
      false,
      baseEmissionRate,
      newMultiplier,
      secondsToMaxMultiplier
    );
    expect((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.false;
  });

  it("Can not recover staking tokens", async function () {
    // Should not be able to recover staking tokens.
    await distributor.configureStakingToken(
      lpToken1.address,
      true,
      baseEmissionRate,
      maxMultiplier,
      secondsToMaxMultiplier
    );
    await lpToken1.mint(distributor.address, toWei(420));
    await expect(distributor.recoverErc20(lpToken1.address, toWei(420))).to.be.revertedWith(
      "Can't recover staking token"
    );
  });

  it("Cannot set staking token to reward token", async function () {
    await expect(
      distributor.configureStakingToken(
        acrossToken.address,
        true,
        baseEmissionRate,
        maxMultiplier,
        secondsToMaxMultiplier
      )
    ).to.be.revertedWith("Staked token is reward token");
  });

  it("Non owner cant execute admin functions", async function () {
    await expect(distributor.connect(rando).configureStakingToken(lpToken1.address, true, 4, 2, 0)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("Permissioning on staking-related methods", async function () {
    await expect(distributor.connect(owner).stake(lpToken1.address, 0)).to.be.revertedWith("stakedToken not enabled");
    await expect(distributor.connect(owner).unstake(lpToken1.address, 0)).to.be.revertedWith(
      "stakedToken not initialized"
    );
    await expect(distributor.connect(owner).withdrawReward(lpToken1.address)).to.be.revertedWith(
      "stakedToken not initialized"
    );
    await expect(distributor.connect(owner).exit(lpToken1.address)).to.be.revertedWith("stakedToken not initialized");

    await distributor.configureStakingToken(
      lpToken1.address,
      true,
      baseEmissionRate,
      maxMultiplier,
      secondsToMaxMultiplier
    );

    await expect(distributor.connect(owner).stake(lpToken1.address, 0)).to.not.be.reverted;
    await expect(distributor.connect(owner).unstake(lpToken1.address, 0)).to.not.be.reverted;
    await expect(distributor.connect(owner).withdrawReward(lpToken1.address)).to.not.be.reverted;
    await expect(distributor.connect(owner).exit(lpToken1.address)).to.not.be.reverted;

    await distributor.configureStakingToken(
      lpToken1.address,
      false,
      baseEmissionRate,
      maxMultiplier,
      secondsToMaxMultiplier
    );

    await expect(distributor.connect(owner).stake(lpToken1.address, 0)).to.be.revertedWith("stakedToken not enabled");
    await expect(distributor.connect(owner).unstake(lpToken1.address, 0)).to.not.be.reverted;
    await expect(distributor.connect(owner).withdrawReward(lpToken1.address)).to.not.be.reverted;
    await expect(distributor.connect(owner).exit(lpToken1.address)).to.not.be.reverted;
  });
});

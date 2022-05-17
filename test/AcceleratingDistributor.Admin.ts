import { expect, ethers, Contract, SignerWithAddress, toWei, getContractFactory } from "./utils";
import { acceleratingDistributorFixture, enableTokenForStaking } from "./AcceleratingDistributor.Fixture";
import { baseEmissionRate, maxMultiplier, secondsToMaxMultiplier } from "./constants";

let timer: Contract, acrossToken: Contract, distributor: Contract, lpToken1: Contract;
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

  it("Can only recover excess staked non-staked tokens", async function () {
    await distributor.enableStaking(lpToken1.address, true, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier);
    // Drop tokens directly onto the contract. Should be able to recover all of them, even though tis is the staked token.
    await lpToken1.mint(distributor.address, toWei(420));
    await expect(() => distributor.recoverErc20(lpToken1.address)).to.changeTokenBalances(
      lpToken1,
      [distributor, owner],
      [toWei(420).mul(-1), toWei(420)]
    );

    // Stake tokens. Should not be able to recover as no excess.
    await lpToken1.mint(rando.address, toWei(69));
    await lpToken1.connect(rando).approve(distributor.address, toWei(69));
    await distributor.connect(rando).stake(lpToken1.address, toWei(69));
    await expect(distributor.recoverErc20(lpToken1.address)).to.be.revertedWith("Can't recover 0 tokens");

    // Mint additional tokens to the contract to simulate someone dropping them accidentally. This should be recoverable.
    await lpToken1.mint(distributor.address, toWei(696));
    await expect(() => distributor.recoverErc20(lpToken1.address)).to.changeTokenBalances(
      lpToken1,
      [distributor, owner],
      [toWei(696).mul(-1), toWei(696)]
    );

    // The contract should be left with the original stake amount in it as this was not recoverable.
    expect(await lpToken1.balanceOf(distributor.address)).to.equal(toWei(69));
    await expect(distributor.recoverErc20(lpToken1.address)).to.be.revertedWith("Can't recover 0 tokens");
  });
  it("Can only recover any amount of a random token", async function () {
    const randomToken = await (await getContractFactory("TestToken", owner)).deploy("RANDO", "RANDO");
    const amount = toWei(420);
    await randomToken.mint(distributor.address, amount);
    await distributor.recoverErc20(randomToken.address);
    expect(await randomToken.balanceOf(distributor.address)).to.equal(toWei(0));
    await expect(distributor.recoverErc20(randomToken.address)).to.be.revertedWith("Can't recover 0 tokens");
  });
  it("Can not recover reward token", async function () {
    await enableTokenForStaking(distributor, lpToken1, acrossToken);
    await expect(distributor.recoverErc20(acrossToken.address)).to.be.revertedWith("Can't recover reward token");
  });

  it("Cannot set staking token to reward token", async function () {
    await expect(
      distributor.enableStaking(acrossToken.address, true, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier)
    ).to.be.revertedWith("Staked token is reward token");
  });

  it("Non owner cant execute admin functions", async function () {
    await expect(distributor.connect(rando).enableStaking(lpToken1.address, true, 4, 2, 0)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("Permissioning on staking-related methods", async function () {
    await expect(distributor.connect(owner).stake(lpToken1.address, 0)).to.be.revertedWith("stakedToken not enabled");
    await expect(distributor.connect(owner).unstake(lpToken1.address, 0)).to.be.revertedWith(
      "stakedToken not initialized"
    );
    await expect(distributor.connect(owner).getReward(lpToken1.address)).to.be.revertedWith(
      "stakedToken not initialized"
    );
    await expect(distributor.connect(owner).exit(lpToken1.address)).to.be.revertedWith("stakedToken not initialized");

    await distributor.enableStaking(lpToken1.address, true, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier);

    await expect(distributor.connect(owner).stake(lpToken1.address, 0)).to.not.be.reverted;
    await expect(distributor.connect(owner).unstake(lpToken1.address, 0)).to.not.be.reverted;
    await expect(distributor.connect(owner).getReward(lpToken1.address)).to.not.be.reverted;
    await expect(distributor.connect(owner).exit(lpToken1.address)).to.not.be.reverted;

    await distributor.enableStaking(lpToken1.address, false, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier);

    await expect(distributor.connect(owner).stake(lpToken1.address, 0)).to.be.revertedWith("stakedToken not enabled");
    await expect(distributor.connect(owner).unstake(lpToken1.address, 0)).to.not.be.reverted;
    await expect(distributor.connect(owner).getReward(lpToken1.address)).to.not.be.reverted;
    await expect(distributor.connect(owner).exit(lpToken1.address)).to.not.be.reverted;
  });
});

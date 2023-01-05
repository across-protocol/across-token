import { expect, ethers, Contract, SignerWithAddress, toWei, getContractFactory } from "./utils";
import { acceleratingDistributorFixture, enableTokenForStaking } from "./AcceleratingDistributor.Fixture";
import { baseEmissionRate, maxMultiplier, secondsToMaxMultiplier } from "./constants";

let timer: Contract, acrossToken: Contract, distributor: Contract, lpToken1: Contract;
let owner: SignerWithAddress, rando: SignerWithAddress;

const zeroAddress = ethers.constants.AddressZero;

describe("AcceleratingDistributor: Admin Functions", async function () {
  beforeEach(async function () {
    [owner, rando] = await ethers.getSigners();
    ({ timer, distributor, acrossToken, lpToken1 } = await acceleratingDistributorFixture());
  });
  it("Enable token for staking", async function () {
    expect((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.false;

    const nLoops = 3;
    // While lastUpdateTime is 0, the token configuration can be modified.
    for (let loop = 1; loop <= nLoops; ++loop) {
      const _baseEmissionRate = baseEmissionRate.add(loop);
      const _maxMultiplier = maxMultiplier.add(loop);
      const _secondsToMaxMultiplier = secondsToMaxMultiplier + loop;

      expect((await distributor.stakingTokens(lpToken1.address)).lastUpdateTime).to.equal(0);
      await distributor.addStakingToken(lpToken1.address, _baseEmissionRate, _maxMultiplier, _secondsToMaxMultiplier);
      expect((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.false;
      expect((await distributor.stakingTokens(lpToken1.address)).baseEmissionRate).to.equal(_baseEmissionRate);
      expect((await distributor.stakingTokens(lpToken1.address)).maxMultiplier).to.equal(_maxMultiplier);
      expect((await distributor.stakingTokens(lpToken1.address)).secondsToMaxMultiplier).to.equal(
        _secondsToMaxMultiplier
      );
    }

    // Enable staking token.
    expect((await distributor.stakingTokens(lpToken1.address)).lastUpdateTime).to.equal(0);
    await distributor.configureStakingToken(lpToken1.address, true);
    expect((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.true;
    expect((await distributor.stakingTokens(lpToken1.address)).lastUpdateTime).to.equal(await timer.getCurrentTime());

    // Can't modify token rewards.
    const newMultiplier = maxMultiplier.add(toWei(1));
    await expect(
      distributor.addStakingToken(lpToken1.address, baseEmissionRate, newMultiplier, secondsToMaxMultiplier)
    ).to.be.revertedWith("Staking token already added");

    //Disable token for staking.
    await distributor.configureStakingToken(lpToken1.address, false);
    expect((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.false;

    // Still can't modify token rewards.
    await expect(
      distributor.addStakingToken(lpToken1.address, baseEmissionRate, maxMultiplier.add(5), secondsToMaxMultiplier)
    ).to.be.revertedWith("Staking token already added");
  });

  it("Can only recover excess staked tokens", async function () {
    await distributor.addStakingToken(lpToken1.address, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier);
    await distributor.configureStakingToken(lpToken1.address, true);

    // Drop tokens directly onto the contract. The owner should be able to fully recover these.
    await lpToken1.mint(distributor.address, toWei(420));
    await expect(() => distributor.recoverToken(lpToken1.address)).to.changeTokenBalances(
      lpToken1,
      [distributor, owner],
      [toWei(420).mul(-1), toWei(420)]
    );

    // Stake tokens. Should not be able to recover as no excess above what that contract thinks it should have.
    await lpToken1.mint(rando.address, toWei(69));
    await lpToken1.connect(rando).approve(distributor.address, toWei(69));
    await distributor.connect(rando).stake(lpToken1.address, toWei(69));
    await expect(distributor.recoverToken(lpToken1.address)).to.be.revertedWith("Can't recover 0 tokens");
    // Mint additional tokens to the contract to simulate someone dropping them accidentally. This should be recoverable.
    await lpToken1.mint(distributor.address, toWei(696));
    await expect(() => distributor.recoverToken(lpToken1.address)).to.changeTokenBalances(
      lpToken1,
      [distributor, owner],
      [toWei(696).mul(-1), toWei(696)]
    );

    // The contract should be left with the original stake amount in it as this was not recoverable.
    expect(await lpToken1.balanceOf(distributor.address)).to.equal(toWei(69));
    await expect(distributor.recoverToken(lpToken1.address)).to.be.revertedWith("Can't recover 0 tokens");
  });
  it("Can skim any amount of a random token", async function () {
    const randomToken = await (await getContractFactory("TestToken", owner)).deploy("RANDO", "RANDO");
    const amount = toWei(420);
    await randomToken.mint(distributor.address, amount);
    await distributor.recoverToken(randomToken.address);
    expect(await randomToken.balanceOf(distributor.address)).to.equal(toWei(0));
    await expect(distributor.recoverToken(randomToken.address)).to.be.revertedWith("Can't recover 0 tokens");
  });

  it("Owner can at any time recover reward token", async function () {
    await acrossToken.mint(distributor.address, toWei(420));

    // Owner can recover tokens at any point in time.
    await expect(() => distributor.recoverToken(acrossToken.address)).to.changeTokenBalances(
      acrossToken,
      [distributor, owner],
      [toWei(420).mul(-1), toWei(420)]
    );
  });

  it("Cannot set staking token to reward token", async function () {
    await expect(
      distributor.addStakingToken(acrossToken.address, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier)
    ).to.be.revertedWith("Staked token is reward token");
  });
  it("Cannot set bad staking configs", async function () {
    await expect(
      distributor.addStakingToken(lpToken1.address, baseEmissionRate, toWei(10000000), secondsToMaxMultiplier)
    ).to.be.revertedWith("maxMultiplier too large");

    await expect(distributor.addStakingToken(lpToken1.address, baseEmissionRate, maxMultiplier, 0)).to.be.revertedWith(
      "secondsToMaxMultiplier is 0"
    );

    await expect(
      distributor.addStakingToken(lpToken1.address, toWei(10000000000), maxMultiplier, secondsToMaxMultiplier)
    ).to.be.revertedWith("baseEmissionRate too large");

    await expect(distributor.addStakingToken(lpToken1.address, baseEmissionRate, toWei(1), secondsToMaxMultiplier)).to
      .not.be.reverted;

    await expect(
      distributor.addStakingToken(
        lpToken1.address,
        baseEmissionRate,
        toWei(".999999999999999999"),
        secondsToMaxMultiplier
      )
    ).to.be.revertedWith("maxMultiplier less than 1e18");
  });

  it("Non owner cant execute admin functions", async function () {
    await expect(distributor.connect(rando).addStakingToken(lpToken1.address, 4, 2, 0)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  it("Permissioning on staking-related methods", async function () {
    await lpToken1.mint(owner.address, toWei(69));
    await lpToken1.connect(owner).approve(distributor.address, toWei(69));

    await distributor.addStakingToken(lpToken1.address, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier);
    await expect(distributor.connect(owner).stake(lpToken1.address, toWei(1))).to.be.revertedWith(
      "stakedToken not enabled"
    );
    await expect(distributor.connect(owner).unstake(lpToken1.address, toWei(1))).to.be.revertedWith(
      "stakedToken not initialized"
    );
    await expect(distributor.connect(owner).withdrawReward(lpToken1.address)).to.be.revertedWith(
      "stakedToken not initialized"
    );
    await expect(distributor.connect(owner).exit(lpToken1.address)).to.be.revertedWith("stakedToken not initialized");

    await distributor.configureStakingToken(lpToken1.address, true);
    await expect(distributor.connect(owner).stake(lpToken1.address, toWei(2))).to.not.be.reverted;
    await expect(distributor.connect(owner).unstake(lpToken1.address, toWei(1))).to.not.be.reverted;
    await expect(distributor.connect(owner).withdrawReward(lpToken1.address)).to.not.be.reverted;
    await expect(distributor.connect(owner).exit(lpToken1.address)).to.not.be.reverted;

    // Balance => non-zero before disabling, to verify that unstake/withdraw/exit is still possible.
    await expect(distributor.connect(owner).stake(lpToken1.address, toWei(2))).to.not.be.reverted;
    await distributor.configureStakingToken(lpToken1.address, false);

    await expect(distributor.connect(owner).stake(lpToken1.address, toWei(1))).to.be.revertedWith(
      "stakedToken not enabled"
    );
    await expect(distributor.connect(owner).unstake(lpToken1.address, toWei(1))).to.not.be.reverted;
    await expect(distributor.connect(owner).withdrawReward(lpToken1.address)).to.not.be.reverted;
    await expect(distributor.connect(owner).exit(lpToken1.address)).to.not.be.reverted;
  });

  it("Input validation on staking-related methods", async function () {
    await lpToken1.mint(owner.address, toWei(69));
    await lpToken1.connect(owner).approve(distributor.address, toWei(69));

    await distributor.addStakingToken(lpToken1.address, baseEmissionRate, maxMultiplier, secondsToMaxMultiplier);

    // Modifiers take precedence when staking is disabled.
    for (const stakingEnabled of [true, false]) {
      await distributor.configureStakingToken(lpToken1.address, stakingEnabled);

      await expect(distributor.connect(owner).stake(lpToken1.address, toWei(0))).to.be.revertedWith(
        stakingEnabled ? "Invalid amount" : "stakedToken not enabled"
      );
      await expect(distributor.connect(owner).stakeFor(lpToken1.address, toWei(0), zeroAddress)).to.be.revertedWith(
        stakingEnabled ? "Invalid beneficiary" : "stakedToken not enabled"
      );
      await expect(distributor.connect(owner).stakeFor(lpToken1.address, toWei(1), zeroAddress)).to.be.revertedWith(
        stakingEnabled ? "Invalid beneficiary" : "stakedToken not enabled"
      );

      if (stakingEnabled) {
        await expect(distributor.connect(owner).stake(lpToken1.address, toWei(1))).to.not.be.reverted;
        await expect(distributor.connect(owner).unstake(lpToken1.address, toWei(0))).to.be.revertedWith(
          "Invalid amount"
        );
        await expect(distributor.connect(owner).unstake(lpToken1.address, toWei(1))).to.not.be.reverted;
      } else {
        await expect(distributor.connect(owner).stake(lpToken1.address, toWei(1))).to.be.revertedWith(
          "stakedToken not enabled"
        );
        await expect(distributor.connect(owner).unstake(lpToken1.address, toWei(0))).to.be.revertedWith(
          "Invalid amount"
        );

        // Staked balance is 0.
        await expect(distributor.connect(owner).unstake(lpToken1.address, toWei(1))).to.be.reverted;
      }
    }

    // Validate withdrawal guards when staking is disabled.
    await distributor.configureStakingToken(lpToken1.address, true);

    await expect(distributor.connect(owner).stake(lpToken1.address, toWei(2))).to.not.be.reverted;

    await distributor.configureStakingToken(lpToken1.address, false);
    await expect(distributor.connect(owner).unstake(lpToken1.address, toWei(0))).to.be.revertedWith("Invalid amount");
    await expect(distributor.connect(owner).unstake(lpToken1.address, toWei(1))).to.not.be.reverted;
    await expect(distributor.connect(owner).exit(lpToken1.address)).to.not.be.reverted;
  });
});

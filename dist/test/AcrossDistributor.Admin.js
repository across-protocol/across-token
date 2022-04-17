"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const AcrossDistributor_Fixture_1 = require("./AcrossDistributor.Fixture");
const constants_1 = require("./constants");
let timer, acrossToken, distributor, lpToken1, lpToken2;
let owner, rando;
describe("AcrossDistributor: Admin Functions", async function () {
  beforeEach(async function () {
    [owner, rando] = await utils_1.ethers.getSigners();
    ({ timer, distributor, acrossToken, lpToken1 } = await (0, AcrossDistributor_Fixture_1.acrossDistributorFixture)());
  });
  it("Enable token for staking", async function () {
    (0, utils_1.expect)((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.false;
    await distributor.enableStaking(
      lpToken1.address,
      true,
      constants_1.baseEmissionRate,
      constants_1.maxMultiplier,
      constants_1.secondsToMaxMultiplier
    );
    (0, utils_1.expect)((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.true;
    (0, utils_1.expect)((await distributor.stakingTokens(lpToken1.address)).baseEmissionRate).to.equal(
      constants_1.baseEmissionRate
    );
    (0, utils_1.expect)((await distributor.stakingTokens(lpToken1.address)).maxMultiplier).to.equal(
      constants_1.maxMultiplier
    );
    (0, utils_1.expect)((await distributor.stakingTokens(lpToken1.address)).secondsToMaxMultiplier).to.equal(
      constants_1.secondsToMaxMultiplier
    );
    (0, utils_1.expect)((await distributor.stakingTokens(lpToken1.address)).lastUpdateTime).to.equal(
      await timer.getCurrentTime()
    );
    // Update settings.
    const newMultiplier = constants_1.maxMultiplier.add((0, utils_1.toWei)(1));
    await distributor.enableStaking(
      lpToken1.address,
      true,
      constants_1.baseEmissionRate,
      newMultiplier,
      constants_1.secondsToMaxMultiplier
    );
    (0, utils_1.expect)((await distributor.stakingTokens(lpToken1.address)).maxMultiplier).to.equal(newMultiplier);
    //Disable token for staking.
    await distributor.enableStaking(
      lpToken1.address,
      false,
      constants_1.baseEmissionRate,
      newMultiplier,
      constants_1.secondsToMaxMultiplier
    );
    (0, utils_1.expect)((await distributor.stakingTokens(lpToken1.address)).enabled).to.be.false;
  });
  it("Recover ERC20 Tokens", async function () {
    // Drop tokens onto the contract. Check they can be recovered by admin.
    await acrossToken.mint(distributor.address, (0, utils_1.toWei)(420));
    (0, utils_1.expect)(await acrossToken.balanceOf(distributor.address)).to.equal((0, utils_1.toWei)(420));
    await distributor.recoverERC20(acrossToken.address, (0, utils_1.toWei)(420));
    (0, utils_1.expect)(await acrossToken.balanceOf(distributor.address)).to.equal((0, utils_1.toBN)(0));
    (0, utils_1.expect)(await acrossToken.balanceOf(owner.address)).to.equal((0, utils_1.toWei)(420));
  });
  it("Can not recover staking tokens", async function () {
    // Should not be able to recover staking tokens.
    await distributor.enableStaking(
      lpToken1.address,
      true,
      constants_1.baseEmissionRate,
      constants_1.maxMultiplier,
      constants_1.secondsToMaxMultiplier
    );
    await lpToken1.mint(distributor.address, (0, utils_1.toWei)(420));
    await (0, utils_1.expect)(distributor.recoverERC20(lpToken1.address, (0, utils_1.toWei)(420))).to.be.revertedWith(
      "Can't recover staking token"
    );
  });
  it("Non owner cant execute admin functions", async function () {
    await (0, utils_1.expect)(
      distributor.connect(rando).enableStaking(lpToken1.address, true, 4, 2, 0)
    ).to.be.revertedWith("Ownable: caller is not the owner");
    await acrossToken.mint(distributor.address, (0, utils_1.toWei)(420));
    await (0, utils_1.expect)(
      distributor.connect(rando).recoverERC20(acrossToken.address, (0, utils_1.toWei)(420))
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
});

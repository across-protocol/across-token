"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const RewardsLockingDistributor_Fixture_1 = require("./RewardsLockingDistributor.Fixture");
let acrossToken, owner, rando;
describe("AcrossToken: Parameterization", async function () {
  beforeEach(async function () {
    [owner, rando] = await utils_1.ethers.getSigners();
    ({ acrossToken } = await (0, RewardsLockingDistributor_Fixture_1.rewardsLockingDistributorFixture)());
  });
  it("Token config set correctly", async function () {
    (0, utils_1.expect)(await acrossToken.name()).to.equal("Across Protocol Token");
    (0, utils_1.expect)(await acrossToken.symbol()).to.equal("ACX");
    (0, utils_1.expect)(await acrossToken.decimals()).to.equal(18);
    (0, utils_1.expect)(await acrossToken.owner()).to.equal(owner.address);
  });
  it("Token mint permissions works as expected set correctly", async function () {
    // Owner can mint and burn.
    await (0, utils_1.expect)(() => acrossToken.mint(owner.address, (0, utils_1.toWei)(69))).to.changeTokenBalance(
      acrossToken,
      owner,
      (0, utils_1.toWei)(69)
    );
    await (0, utils_1.expect)(() => acrossToken.burn(owner.address, (0, utils_1.toWei)(4))).to.changeTokenBalance(
      acrossToken,
      owner,
      (0, utils_1.toWei)(-4)
    );
    // Non-owner cant call either method.
    const revertMsg = "Ownable: caller is not the owner";
    await (0, utils_1.expect)(acrossToken.connect(rando).mint(rando.address, 420)).to.be.revertedWith(revertMsg);
    await (0, utils_1.expect)(acrossToken.connect(rando).burn(rando.address, 420)).to.be.revertedWith(revertMsg);
  });
});

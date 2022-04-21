import { expect, ethers, Contract, SignerWithAddress, toWei } from "./utils";
import { rewardsLockingDistributorFixture } from "./RewardsLockingDistributor.Fixture";

let rewardToken: Contract, owner: SignerWithAddress, rando: SignerWithAddress;

describe("AcrossToken: Parameterization", async function () {
  beforeEach(async function () {
    [owner, rando] = await ethers.getSigners();
    ({ rewardToken } = await rewardsLockingDistributorFixture());
  });
  it("Token config set correctly", async function () {
    expect(await rewardToken.name()).to.equal("Across Protocol Token");
    expect(await rewardToken.symbol()).to.equal("ACX");
    expect(await rewardToken.decimals()).to.equal(18);
    expect(await rewardToken.owner()).to.equal(owner.address);
  });
  it("Token mint permissions works as expected set correctly", async function () {
    // Owner can mint and burn.
    await expect(() => rewardToken.mint(owner.address, toWei(69))).to.changeTokenBalance(rewardToken, owner, toWei(69));
    await expect(() => rewardToken.burn(owner.address, toWei(4))).to.changeTokenBalance(rewardToken, owner, toWei(-4));

    // Non-owner cant call either method.
    const revertMsg = "Ownable: caller is not the owner";
    await expect(rewardToken.connect(rando).mint(rando.address, 420)).to.be.revertedWith(revertMsg);
    await expect(rewardToken.connect(rando).burn(rando.address, 420)).to.be.revertedWith(revertMsg);
  });
});

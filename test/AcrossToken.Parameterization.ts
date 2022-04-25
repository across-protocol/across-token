import { expect, ethers, Contract, SignerWithAddress, toWei } from "./utils";
import { rewardsLockingDistributorFixture } from "./RewardsLockingDistributor.Fixture";

let acrossToken: Contract, owner: SignerWithAddress, rando: SignerWithAddress;

describe("AcrossToken: Parameterization", async function () {
  beforeEach(async function () {
    [owner, rando] = await ethers.getSigners();
    ({ acrossToken } = await rewardsLockingDistributorFixture());
  });
  it("Token config set correctly", async function () {
    expect(await acrossToken.name()).to.equal("Across Protocol Token");
    expect(await acrossToken.symbol()).to.equal("ACX");
    expect(await acrossToken.decimals()).to.equal(18);
    expect(await acrossToken.owner()).to.equal(owner.address);
  });
  it("Token mint permissions works as expected set correctly", async function () {
    // Owner can mint and burn.
    await expect(() => acrossToken.mint(owner.address, toWei(69))).to.changeTokenBalance(acrossToken, owner, toWei(69));
    await expect(() => acrossToken.burn(owner.address, toWei(4))).to.changeTokenBalance(acrossToken, owner, toWei(-4));

    // Non-owner cant call either method.
    const revertMsg = "Ownable: caller is not the owner";
    await expect(acrossToken.connect(rando).mint(rando.address, 420)).to.be.revertedWith(revertMsg);
    await expect(acrossToken.connect(rando).burn(rando.address, 420)).to.be.revertedWith(revertMsg);
  });
});

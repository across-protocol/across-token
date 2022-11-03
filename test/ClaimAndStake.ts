import { expect, ethers, Contract, SignerWithAddress, toWei, toBN, getContractFactory } from "./utils";
import { acceleratingDistributorFixture, enableTokenForStaking } from "./AcceleratingDistributor.Fixture";
import { MAX_UINT_VAL, ZERO_ADDRESS } from "@uma/common";
import { MerkleTree } from "@uma/merkle-distributor";
import { baseEmissionRate, maxMultiplier, secondsToMaxMultiplier } from "./constants";

let acrossToken: Contract, distributor: Contract, lpToken1: Contract, claimer: SignerWithAddress;
let merkleDistributor: Contract, contractCreator: SignerWithAddress, lpToken2: Contract, claimAndStake: Contract;

type Recipient = {
  account: string;
  amount: string;
  accountIndex: number;
};

type RecipientWithProof = Recipient & {
  windowIndex: number;
  merkleProof: Buffer[];
};

const createLeaf = (recipient: Recipient) => {
  expect(Object.keys(recipient).every((val) => ["account", "amount", "accountIndex"].includes(val))).to.be.true;

  return Buffer.from(
    ethers.utils
      .solidityKeccak256(
        ["address", "uint256", "uint256"],
        [recipient.account, recipient.amount, recipient.accountIndex]
      )
      .slice(2),
    "hex"
  );
};

const window1RewardAmount = toBN(toWei("100"));
const window2RewardAmount = toBN(toWei("300"));
const totalBatchRewards = window1RewardAmount.add(window2RewardAmount);
let batchedClaims: RecipientWithProof[];

describe("ClaimAndStake: Atomic Claim and Stake", async function () {
  beforeEach(async function () {
    [contractCreator, claimer] = await ethers.getSigners();
    ({ distributor, acrossToken, lpToken1, lpToken2, merkleDistributor, claimAndStake } =
      await acceleratingDistributorFixture());

    // Enable reward token for staking.
    await enableTokenForStaking(distributor, lpToken1, acrossToken);

    // Seed MerkleDistributor with reward tokens.
    await lpToken1.connect(contractCreator).mint(contractCreator.address, MAX_UINT_VAL);
    await lpToken1.connect(contractCreator).approve(merkleDistributor.address, MAX_UINT_VAL);

    // Set two windows with trivial one leaf trees.
    const reward1Recipients = [
      {
        account: claimer.address,
        amount: window1RewardAmount.toString(),
        accountIndex: 0,
      },
    ];
    const reward2Recipients = [
      {
        account: claimer.address,
        amount: window2RewardAmount.toString(),
        accountIndex: 0,
      },
    ];

    const merkleTree1 = new MerkleTree(reward1Recipients.map((item) => createLeaf(item)));
    await merkleDistributor
      .connect(contractCreator)
      .setWindow(window1RewardAmount, lpToken1.address, merkleTree1.getRoot(), "");

    const merkleTree2 = new MerkleTree(reward2Recipients.map((item) => createLeaf(item)));
    await merkleDistributor
      .connect(contractCreator)
      .setWindow(window2RewardAmount, lpToken1.address, merkleTree2.getRoot(), "");

    // Construct claims for all trees assuming that each tree index is equal to its window index.
    batchedClaims = [
      {
        windowIndex: 0,
        account: reward1Recipients[0].account,
        accountIndex: reward1Recipients[0].accountIndex,
        amount: reward1Recipients[0].amount,
        merkleProof: merkleTree1.getProof(createLeaf(reward1Recipients[0])),
      },
      {
        windowIndex: 1,
        account: reward2Recipients[0].account,
        accountIndex: reward2Recipients[0].accountIndex,
        amount: reward2Recipients[0].amount,
        merkleProof: merkleTree2.getProof(createLeaf(reward2Recipients[0])),
      },
    ];
    expect(await lpToken1.balanceOf(claimer.address)).to.equal(toBN(0));

    // Tests require staker to have approved contract
    await lpToken1.connect(claimer).approve(distributor.address, MAX_UINT_VAL);
  });

  it("Happy path", async function () {
    const time = await distributor.getCurrentTime();
    await expect(claimAndStake.connect(claimer).claimAndStake(batchedClaims[0]))
      .to.emit(distributor, "Stake")
      .withArgs(lpToken1.address, claimer.address, window1RewardAmount, time, window1RewardAmount, window1RewardAmount);
    expect((await distributor.getUserStake(lpToken1.address, claimer.address)).cumulativeBalance).to.equal(
      window1RewardAmount
    );
    expect((await distributor.getUserStake(lpToken1.address, claimAndStake.address)).cumulativeBalance).to.equal(
      toBN(0)
    );
    expect(await lpToken1.balanceOf(merkleDistributor.address)).to.equal(window2RewardAmount);
    expect(await lpToken1.balanceOf(claimer.address)).to.equal(toBN(0));
  });
  it("Multicall", async function () {
    const callData1 = claimAndStake.interface.encodeFunctionData("claimAndStake", [batchedClaims[0]]);
    const callData2 = claimAndStake.interface.encodeFunctionData("claimAndStake", [batchedClaims[1]]);
    await claimAndStake.connect(claimer).multicall([callData1, callData2]);
    expect((await distributor.getUserStake(lpToken1.address, claimer.address)).cumulativeBalance).to.equal(
      totalBatchRewards
    );
    expect((await distributor.getUserStake(lpToken1.address, claimAndStake.address)).cumulativeBalance).to.equal(
      toBN(0)
    );
    expect(await lpToken1.balanceOf(merkleDistributor.address)).to.equal(toBN(0));
    expect(await lpToken1.balanceOf(claimer.address)).to.equal(toBN(0));
  });
  it("Fails if ClaimAndStake contract is not whitelisted claimer on MerkleDistributor", async function () {
    await merkleDistributor.whitelistClaimer(claimAndStake.address, false);
    await expect(claimAndStake.connect(claimer).claimAndStake(batchedClaims[0])).to.be.revertedWith(
      "unwhitelisted claimer"
    );
  });
  it("Claim account is not caller", async function () {
    // Claiming with account that isn't receiving the claims causes revert
    await expect(claimAndStake.connect(contractCreator).claimAndStake(batchedClaims[0])).to.be.revertedWith(
      "claim account not caller"
    );
  });
  it("Claimed token is not eligible for staking", async function () {
    // Disable staking token
    await distributor.configureStakingToken(
      lpToken1.address,
      false,
      baseEmissionRate,
      maxMultiplier,
      secondsToMaxMultiplier
    );
    await expect(claimAndStake.connect(claimer).claimAndStake(batchedClaims[0])).to.be.revertedWith(
      "stakedToken not enabled"
    );
  });
});

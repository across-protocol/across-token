// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "./test/Testable.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

import "hardhat/console.sol";

/**
 * @notice Across token distribution contract. Contract is inspired by Synthetix staking contract and Ampleforth geyser.
 * Stakers start by earning their pro-rate share of a baseEmmissionRate per second which increases based on how long
 * they have staked in the contract, up to a maximum of maxEmmissionRate. Multiple LP tokens can be staked in this
 * contract enabling depositors to batch stake and claim via multicall.
 *
 */

contract AcrossDistributor is Testable, ReentrancyGuard, Pausable, Ownable, Multicall {
    using SafeERC20 for IERC20;

    IERC20 public rewardToken;

    // Each User deposit is tracked with the information below.
    struct UserDeposit {
        uint256 cumulativeBalance;
        uint256 averageDepositTime;
        uint256 rewardsPaidPerToken;
        uint256 rewardsOutstanding;
    }

    struct StakingToken {
        bool enabled;
        uint256 baseEmissionRate;
        uint256 maxMultiplier;
        uint256 secondsToMaxMultiplier;
        uint256 cumulativeStaked;
        uint256 rewardPerTokenStored;
        uint256 lastUpdateTime;
        mapping(address => UserDeposit) stakingBalances;
    }

    mapping(address => StakingToken) public stakingTokens;

    constructor(address _rewardToken, address _timer) Testable(_timer) {
        rewardToken = IERC20(_rewardToken);
    }

    /**************************************
     *               EVENTS               *
     **************************************/

    event TokenEnabledForStaking(
        address token,
        bool enabled,
        uint256 baseEmissionRate,
        uint256 maxMultiplier,
        uint256 secondsToMaxMultiplier,
        uint256 lastUpdateTime
    );

    event RecoverErc20(address token, address to, uint256 amount);

    event Stake(address token, address user, uint256 amount, uint256 averageDepositTime, uint256 cumulativeBalance);

    event Unstake(address token, address user, uint256 amount, uint256 remainingCumulativeBalance);

    event GetReward(address token, address user, uint256 rewardsOutstanding);

    event Exit(address token, address user);

    /**************************************
     *             MODIFIERS              *
     **************************************/

    modifier updateReward(address stakedToken, address account) {
        StakingToken storage stakingToken = stakingTokens[stakedToken];
        stakingToken.rewardPerTokenStored = baseRewardPerToken(stakedToken);
        stakingToken.lastUpdateTime = getCurrentTime();
        if (account != address(0)) {
            UserDeposit storage userDeposit = stakingToken.stakingBalances[account];
            userDeposit.rewardsOutstanding = outstandingRewards(stakedToken, account);
            userDeposit.rewardsPaidPerToken = stakingToken.rewardPerTokenStored;
        }
        _;
    }

    /**************************************
     *          ADMIN FUNCTIONS           *
     **************************************/

    /**
     * @notice Enable a token for staking.
     * @param stakedToken The address of the token that can be staked.
     * @param enabled Whether the token is enabled for staking.
     * @param baseEmissionRate The base emission rate for staking the token. This is split pro-rate between all users.
     * @param maxMultiplier The maximum multiplier for staking which increases your rewards the longer you stake.
     * @param secondsToMaxMultiplier The number of seconds needed to stake to reach the maximum multiplier.
     */
    function enableStaking(
        address stakedToken,
        bool enabled,
        uint256 baseEmissionRate,
        uint256 maxMultiplier,
        uint256 secondsToMaxMultiplier
    ) public onlyOwner {
        StakingToken storage stakingToken = stakingTokens[stakedToken];

        stakingToken.enabled = enabled;
        stakingToken.baseEmissionRate = baseEmissionRate;
        stakingToken.maxMultiplier = maxMultiplier;
        stakingToken.secondsToMaxMultiplier = secondsToMaxMultiplier;
        stakingToken.lastUpdateTime = getCurrentTime();

        emit TokenEnabledForStaking(
            stakedToken,
            enabled,
            baseEmissionRate,
            maxMultiplier,
            secondsToMaxMultiplier,
            getCurrentTime()
        );
    }

    /**
     * @notice Recover an ERC20 token either dropped on the contract or excess after the end of the staking program ends.
     * @param tokenAddress The address of the token to recover.
     * @param amount The amount of the token to recover.
     */
    function recoverERC20(address tokenAddress, uint256 amount) external onlyOwner {
        require(stakingTokens[tokenAddress].lastUpdateTime == 0, "Can't recover staking token");
        IERC20(tokenAddress).safeTransfer(owner(), amount);

        emit RecoverErc20(tokenAddress, owner(), amount);
    }

    /**************************************
     *          STAKER FUNCTIONS          *
     **************************************/

    /**
     * @notice Stake tokens for rewards.
     * @dev The caller of this function must approve this contract to spend amount of stakedToken.
     * @param stakedToken The address of the token to stake.
     * @param amount The amount of the token to stake.
     */
    function stake(address stakedToken, uint256 amount) public nonReentrant updateReward(stakedToken, msg.sender) {
        require(stakingTokens[stakedToken].enabled, "Token is not enabled for staking");

        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[msg.sender];

        uint256 averageDepositTime = userDeposit.averageDepositTime +
            (amount / (userDeposit.cumulativeBalance + amount)) *
            (getCurrentTime() - userDeposit.averageDepositTime);

        userDeposit.averageDepositTime = averageDepositTime;
        userDeposit.cumulativeBalance += amount;
        stakingTokens[stakedToken].cumulativeStaked += amount;

        IERC20(stakedToken).safeTransferFrom(msg.sender, address(this), amount);

        emit Stake(stakedToken, msg.sender, amount, averageDepositTime, userDeposit.cumulativeBalance);
    }

    /**
     * @notice Withdraw staked tokens.
     * @param stakedToken The address of the token to withdraw.
     * @param amount The amount of the token to withdraw.
     */
    function unstake(address stakedToken, uint256 amount) public nonReentrant updateReward(stakedToken, msg.sender) {
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[msg.sender];

        // Note this will revert if underflow so you cant unstake more than your cumulativeBalance.
        userDeposit.cumulativeBalance -= amount;
        IERC20(stakedToken).safeTransferFrom(address(this), msg.sender, amount);

        emit Unstake(stakedToken, msg.sender, amount, userDeposit.cumulativeBalance);
    }

    /**
     * @notice Get entitled rewards for the staker.
     * @dev Note that calling this method acts to reset your reward multiplier.
     * @param stakedToken The address of the token to get rewards for.
     */
    function getReward(address stakedToken) public nonReentrant updateReward(stakedToken, msg.sender) {
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[msg.sender];

        if (userDeposit.rewardsOutstanding > 0) {
            rewardToken.safeTransfer(msg.sender, userDeposit.rewardsOutstanding);
            userDeposit.rewardsOutstanding = 0;
            userDeposit.averageDepositTime = getCurrentTime();
        }

        emit GetReward(stakedToken, msg.sender, userDeposit.rewardsOutstanding);
    }

    /**
     * @notice Exits a staking position by unstaking and getting rewards. This totally exists the staking position.
     * @dev Note that calling this method acts to reset your reward multiplier.
     * @param stakedToken The address of the token to get rewards for.
     */
    function exit(address stakedToken) external updateReward(stakedToken, msg.sender) {
        unstake(stakedToken, stakingTokens[stakedToken].stakingBalances[msg.sender].cumulativeBalance);
        getReward(stakedToken);

        emit Exit(stakedToken, msg.sender);
    }

    /**************************************
     *           VIEW FUNCTIONS           *
     **************************************/

    function getCumulativeStakingBalance(address stakedToken, address account) public view returns (uint256) {
        return stakingTokens[stakedToken].stakingBalances[account].cumulativeBalance;
    }

    function baseRewardPerToken(address stakedToken) public view returns (uint256) {
        StakingToken storage stakingToken = stakingTokens[stakedToken];
        if (stakingToken.cumulativeStaked == 0) return stakingToken.rewardPerTokenStored;

        return
            stakingToken.rewardPerTokenStored +
            ((getCurrentTime() - stakingToken.lastUpdateTime) * stakingToken.baseEmissionRate * 1e18) /
            stakingToken.cumulativeStaked;
    }

    function getUserRewardMultiplier(address stakedToken, address account) public view returns (uint256) {
        if (stakingTokens[stakedToken].stakingBalances[account].averageDepositTime == 0) return 1;
        uint256 fractionOfMaxMultiplier = ((getCurrentTime() -
            stakingTokens[stakedToken].stakingBalances[account].averageDepositTime) * 1e18) /
            stakingTokens[stakedToken].secondsToMaxMultiplier;

        // At maximum, the multiplier should be equal to the maxMultiplier.
        if (fractionOfMaxMultiplier > 1e18) fractionOfMaxMultiplier = 1e18;
        return 1e18 + (fractionOfMaxMultiplier * (stakingTokens[stakedToken].maxMultiplier - 1e18)) / (1e18);
    }

    function outstandingRewards(address stakedToken, address account) public view returns (uint256) {
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[account];

        uint256 userRewardMultiplier = getUserRewardMultiplier(stakedToken, account);

        return
            (userDeposit.cumulativeBalance *
                (baseRewardPerToken(stakedToken) - userDeposit.rewardsPaidPerToken) *
                userRewardMultiplier) /
            (1e18 * 1e18) +
            userDeposit.rewardsOutstanding;
    }
}

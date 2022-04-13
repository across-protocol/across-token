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

contract AcrossDistributor is Testable, ReentrancyGuard, Pausable, Ownable, Multicall {
    using SafeERC20 for IERC20;

    IERC20 public rewardToken;

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

    function enableStaking(
        address token,
        bool enabled,
        uint256 baseEmissionRate,
        uint256 maxMultiplier,
        uint256 secondsToMaxMultiplier
    ) public onlyOwner {
        StakingToken storage stakingToken = stakingTokens[token];

        stakingToken.enabled = enabled;
        stakingToken.baseEmissionRate = baseEmissionRate;
        stakingToken.maxMultiplier = maxMultiplier;
        stakingToken.secondsToMaxMultiplier = secondsToMaxMultiplier;
        stakingToken.lastUpdateTime = getCurrentTime();
    }

    function recoverERC20(address tokenAddress, uint256 tokenAmount) external onlyOwner {
        require(stakingTokens[tokenAddress].lastUpdateTime == 0, "Can't recover staking token");
        IERC20(tokenAddress).safeTransfer(owner(), tokenAmount);
    }

    /**************************************
     *          STAKER FUNCTIONS          *
     **************************************/

    function stake(address stakedToken, uint256 amountToStake)
        public
        nonReentrant
        updateReward(stakedToken, msg.sender)
    {
        require(stakingTokens[stakedToken].enabled, "Token is not enabled for staking");

        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[msg.sender];

        uint256 averageDepositTime = userDeposit.averageDepositTime +
            (amountToStake / (userDeposit.cumulativeBalance + amountToStake)) *
            (getCurrentTime() - userDeposit.averageDepositTime);

        userDeposit.averageDepositTime = averageDepositTime;
        userDeposit.cumulativeBalance += amountToStake;
        stakingTokens[stakedToken].cumulativeStaked += amountToStake;

        IERC20(stakedToken).safeTransferFrom(msg.sender, address(this), amountToStake);
    }

    function unstake(address stakedToken, uint256 amountToUnstake)
        public
        nonReentrant
        updateReward(stakedToken, msg.sender)
    {
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[msg.sender];

        // Note this will revert if underflow so you cant unstake more than your cumulativeBalance.
        userDeposit.cumulativeBalance -= amountToUnstake;
    }

    function getReward(address stakedToken) public nonReentrant updateReward(stakedToken, msg.sender) {
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[msg.sender];

        if (userDeposit.rewardsOutstanding > 0) {
            rewardToken.safeTransfer(msg.sender, userDeposit.rewardsOutstanding);
            userDeposit.rewardsOutstanding = 0;
            userDeposit.averageDepositTime = getCurrentTime();
        }
    }

    function exit(address stakedToken) external updateReward(stakedToken, msg.sender) {
        unstake(stakedToken, stakingTokens[stakedToken].stakingBalances[msg.sender].cumulativeBalance);
        getReward(stakedToken);
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

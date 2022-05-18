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
 * Stakers start by earning their pro-rate share of a baseEmissionRate per second which increases based on how long
 * they have staked in the contract, up to a maximum of maxEmissionRate. Multiple LP tokens can be staked in this
 * contract enabling depositors to batch stake and claim via multicall.
 *
 */

contract AcceleratingDistributor is Testable, ReentrancyGuard, Pausable, Ownable, Multicall {
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

    modifier onlyEnabled(address stakedToken) {
        require(stakingTokens[stakedToken].enabled, "stakedToken not enabled");
        _;
    }

    modifier onlyInitialized(address stakedToken) {
        require(stakingTokens[stakedToken].lastUpdateTime != 0, "stakedToken not initialized");
        _;
    }

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
    event GetReward(address token, address user, uint256 rewardsToSend);
    event Exit(address token, address user);

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
        // Because of the way balances are managed, the staked token cannot be the reward token. Otherwise, reward
        // payouts could eat into user balances.
        require(stakedToken != address(rewardToken), "Staked token is reward token");

        StakingToken storage stakingToken = stakingTokens[stakedToken];

        // If this token is already initialized, make sure we update the rewards before modifying any params.
        if (stakingToken.lastUpdateTime != 0) _updateReward(stakedToken, address(0));

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
            stakingToken.lastUpdateTime
        );
    }

    /**
     * @notice Recover an ERC20 token either dropped on the contract or excess after the end of the staking program ends.
     * @dev Any wallet can call this function as it will only ever send tokens to the owner of the distributor.
     * @param tokenAddress The address of the token to recover.
     * @param amount The amount of the token to recover.
     */
    function recoverErc20(address tokenAddress, uint256 amount) external {
        require(stakingTokens[tokenAddress].lastUpdateTime == 0, "Can't recover staking token");
        require(tokenAddress != address(rewardToken), "Can't recover reward token");
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
    function stake(address stakedToken, uint256 amount) public nonReentrant onlyEnabled(stakedToken) {
        _updateReward(stakedToken, msg.sender);

        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[msg.sender];

        uint256 averageDepositTime = getAverageDepositTimePostDeposit(stakedToken, msg.sender, amount);

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
    function unstake(address stakedToken, uint256 amount) public nonReentrant onlyInitialized(stakedToken) {
        _updateReward(stakedToken, msg.sender);
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[msg.sender];

        // Note: these will revert if underflow so you cant unstake more than your cumulativeBalance.
        userDeposit.cumulativeBalance -= amount;
        stakingTokens[stakedToken].cumulativeStaked -= amount;

        IERC20(stakedToken).safeTransfer(msg.sender, amount);

        emit Unstake(stakedToken, msg.sender, amount, userDeposit.cumulativeBalance);
    }

    /**
     * @notice Get entitled rewards for the staker.
     * @dev Calling this method will reset the callers reward multiplier.
     * @param stakedToken The address of the token to get rewards for.
     */
    function getReward(address stakedToken) public nonReentrant onlyInitialized(stakedToken) {
        _updateReward(stakedToken, msg.sender);
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[msg.sender];

        uint256 rewardsToSend = userDeposit.rewardsOutstanding;
        if (rewardsToSend > 0) {
            userDeposit.rewardsOutstanding = 0;
            userDeposit.averageDepositTime = getCurrentTime();
            rewardToken.safeTransfer(msg.sender, rewardsToSend);
        }

        emit GetReward(stakedToken, msg.sender, rewardsToSend);
    }

    /**
     * @notice Exits a staking position by unstaking and getting rewards. This totally exists the staking position.
     * @dev Calling this method will reset the callers reward multiplier.
     * @param stakedToken The address of the token to get rewards for.
     */
    function exit(address stakedToken) external onlyInitialized(stakedToken) {
        _updateReward(stakedToken, msg.sender);
        unstake(stakedToken, stakingTokens[stakedToken].stakingBalances[msg.sender].cumulativeBalance);
        getReward(stakedToken);

        emit Exit(stakedToken, msg.sender);
    }

    /**************************************
     *           VIEW FUNCTIONS           *
     **************************************/

    /**
     * @notice Returns the total staked for a given stakedToken.
     * @param stakedToken The address of the staked token to query.
     * @return uint256 Total amount staked of the stakedToken.
     */
    function getCumulativeStaked(address stakedToken) public view returns (uint256) {
        return stakingTokens[stakedToken].cumulativeStaked;
    }

    /**
     * @notice Returns the all information associated with a user's stake.
     * @param stakedToken The address of the staked token to query.
     * @param account The address of user to query.
     * @return UserDeposit Struct with: {cumulativeBalance,averageDepositTime,rewardsPaidPerToken,rewardsOutstanding}
     */
    function getUserStake(address stakedToken, address account) public view returns (UserDeposit memory) {
        return stakingTokens[stakedToken].stakingBalances[account];
    }

    /**
     * @notice Returns the base rewards per staked token for a given staking token. This factors in the last time
     * any internal logic was called on this contract to correctly attribute retroactive cumulative rewards.
     * @param stakedToken The address of the staked token to query.
     * @return uint256 Total base reward per token that will be applied, pro-rata, to stakers.
     */
    function baseRewardPerToken(address stakedToken) public view returns (uint256) {
        StakingToken storage stakingToken = stakingTokens[stakedToken];
        if (stakingToken.cumulativeStaked == 0) return stakingToken.rewardPerTokenStored;

        return
            stakingToken.rewardPerTokenStored +
            ((getCurrentTime() - stakingToken.lastUpdateTime) * stakingToken.baseEmissionRate * 1e18) /
            stakingToken.cumulativeStaked;
    }

    /**
     * @notice Returns the multiplier applied to the base reward per staked token for a given staking token and account.
     * The longer a user stakes the higher their multiplier up to maxMultiplier for that given staking token.
     * any internal logic was called on this contract to correctly attribute retroactive cumulative rewards.
     * @param stakedToken The address of the staked token to query.
     * @param account The address of the user to query.
     * @return uint256 User multiplier, applied to the baseRewardPerToken, when claiming rewards.
     */
    function getUserRewardMultiplier(address stakedToken, address account) public view returns (uint256) {
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[account];
        if (userDeposit.averageDepositTime == 0 || userDeposit.cumulativeBalance == 0) return 1e18;
        uint256 fractionOfMaxMultiplier = ((getTimeFromLastDeposit(stakedToken, account)) * 1e18) /
            stakingTokens[stakedToken].secondsToMaxMultiplier;

        // At maximum, the multiplier should be equal to the maxMultiplier.
        if (fractionOfMaxMultiplier > 1e18) fractionOfMaxMultiplier = 1e18;
        return 1e18 + (fractionOfMaxMultiplier * (stakingTokens[stakedToken].maxMultiplier - 1e18)) / (1e18);
    }

    /**
     * @notice Returns the total outstanding rewards entitled to a user for a given staking token. This factors in the
     * users staking duration (and therefore reward multiplier) and their pro-rata share of the total rewards.
     * @param stakedToken The address of the staked token to query.
     * @param account The address of the user to query.
     * @return uint256 Total outstanding rewards entitled to user.
     */
    function getOutstandingRewards(address stakedToken, address account) public view returns (uint256) {
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[account];

        uint256 userRewardMultiplier = getUserRewardMultiplier(stakedToken, account);

        uint256 newUserRewards = (userDeposit.cumulativeBalance *
            (baseRewardPerToken(stakedToken) - userDeposit.rewardsPaidPerToken) *
            userRewardMultiplier) / (1e18 * 1e18);

        return newUserRewards + userDeposit.rewardsOutstanding;
    }

    /**
     * @notice Returns the time that has elapsed between the current time and the last users average deposit time.
     * @param stakedToken The address of the staked token to query.
     * @param account The address of the user to query.
     *@return uint256 Time, in seconds, between the users average deposit time and the current time.
     */
    function getTimeFromLastDeposit(address stakedToken, address account) public view returns (uint256) {
        return getCurrentTime() - stakingTokens[stakedToken].stakingBalances[account].averageDepositTime;
    }

    /**
     * @notice Returns a users new average deposit time, considering the addition of a new deposit. This factors in the
     * cumulative previous deposits, new deposit and time from the last deposit.
     * @param stakedToken The address of the staked token to query.
     * @param account The address of the user to query.
     * @return uint256 Average post deposit time, considering all deposits to date.
     */
    function getAverageDepositTimePostDeposit(
        address stakedToken,
        address account,
        uint256 amount
    ) public view returns (uint256) {
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[account];
        if (amount == 0) return userDeposit.averageDepositTime;
        uint256 amountWeightedTime = (((amount * 1e18) / (userDeposit.cumulativeBalance + amount)) *
            (getTimeFromLastDeposit(stakedToken, account))) / 1e18;
        return userDeposit.averageDepositTime + amountWeightedTime;
    }

    /**************************************
     *         INTERNAL FUNCTIONS         *
     **************************************/

    // Update the internal counters for a given stakedToken and user.
    function _updateReward(address stakedToken, address account) internal {
        StakingToken storage stakingToken = stakingTokens[stakedToken];
        stakingToken.rewardPerTokenStored = baseRewardPerToken(stakedToken);
        stakingToken.lastUpdateTime = getCurrentTime();
        if (account != address(0)) {
            UserDeposit storage userDeposit = stakingToken.stakingBalances[account];
            userDeposit.rewardsOutstanding = getOutstandingRewards(stakedToken, account);
            userDeposit.rewardsPaidPerToken = stakingToken.rewardPerTokenStored;
        }
    }
}

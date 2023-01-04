// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";

/**
 * @title Across Accelerating Distributor (Staking) Contract
 * @notice Stakers start by earning their pro-rata share of a baseEmissionRate per second. The baseEmissionRate is
 * amplified by a reward multiplier, which increases up to a configurable maxMultiplier, based on the time and amounts
 * of previous deposits into the contract. Multiple LP tokens can be staked in this contract enabling depositors to
 * batch stake and claim via multicall.
 * @notice This contract is only compatible with standard ERC20 tokens, and not tokens that charge fees on transfers,
 * dynamically change balance, or have double entry-points. It's the responsibility of the contract owner to ensure
 * they only add supported tokens, and that staking token configurations are applied correctly.
 * @dev This contract is inspired by the Synthetix staking contract, and the Ampleforth geyser.
 */

contract AcceleratingDistributor is ReentrancyGuard, Ownable, Multicall {
    using SafeERC20 for IERC20;

    /**************************************
     *          TYPE DECLARATIONS         *
     **************************************/

    /**
     * @notice Tracks the staking balance and associated rewards of an address for a single staking token.
     * @dev Stored user rewards are updated each time a Staker Function is called with the user's address.
     * @param cumulativeBalance User's current total staking balance in the contract for this address.
     * @param averageDepositTime Averaged timestamp of user's entry into the pool, weighted by the size of each deposit.
     * @param rewardsAccumulatedPerToken User's cumulative per-unit share of staking rewards as at the last update.
     * @param rewardsOutstanding Staking reward tokens available to be claimed since last update.
     */
    struct UserDeposit {
        uint256 cumulativeBalance;
        uint256 averageDepositTime;
        uint256 rewardsAccumulatedPerToken;
        uint256 rewardsOutstanding;
    }

    /**
     * @notice Tracks the global configuration and state of each staking token.
     * @dev Global stakingToken state is updated each time a Staker Function is called.
     * @param baseEmissionRate Base staking token emission rate, before applying any user multiplier.
     * @param maxMultiplier Maximum achievable multiplier to be applied to baseEmissionRate.
     * @param secondsToMaxMulitplier Number of seconds after user's averageDepositTime before reaching maxMultiplier.
     * @param cumulativeStaked Total amount of deposit token staked in contract.
     * @param rewardPerTokenStored Global cumulative per-unit share of staking rewards as at the last update.
     * @param lastUpdateTime Timestamp of last configuration change or rewards calculation.
     */
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

    /**************************************
     *           STATE VARIABLES          *
     **************************************/

    IERC20 public immutable rewardToken;

    mapping(address => StakingToken) public stakingTokens;

    /**************************************
     *               EVENTS               *
     **************************************/

    event TokenConfiguredForStaking(
        address indexed token,
        bool enabled,
        uint256 baseEmissionRate,
        uint256 maxMultiplier,
        uint256 secondsToMaxMultiplier,
        uint256 lastUpdateTime
    );
    event RecoverToken(address indexed token, uint256 amount);
    event Stake(
        address indexed token,
        address indexed user,
        uint256 amount,
        uint256 averageDepositTime,
        uint256 cumulativeBalance,
        uint256 tokenCumulativeStaked
    );
    event Unstake(
        address indexed token,
        address indexed user,
        uint256 amount,
        uint256 remainingCumulativeBalance,
        uint256 tokenCumulativeStaked
    );
    event RewardsWithdrawn(
        address indexed token,
        address indexed user,
        uint256 rewardsToSend,
        uint256 tokenLastUpdateTime,
        uint256 tokenRewardPerTokenStored,
        uint256 userRewardsPaidPerToken
    );
    event Exit(address indexed token, address indexed user, uint256 tokenCumulativeStaked);

    /**************************************
     *              MODIFIERS             *
     **************************************/

    modifier onlyEnabled(address stakedToken) {
        require(stakingTokens[stakedToken].enabled, "stakedToken not enabled");
        _;
    }

    modifier onlyInitialized(address stakedToken) {
        require(stakingTokens[stakedToken].lastUpdateTime != 0, "stakedToken not initialized");
        _;
    }

    /**************************************
     *            CONSTRUCTOR             *
     **************************************/

    constructor(address _rewardToken) {
        rewardToken = IERC20(_rewardToken);
    }

    /**************************************
     *          ADMIN FUNCTIONS           *
     **************************************/

    /**
     * @notice Enable a token for staking. Emits a TokenConfiguredForStaking event on success.
     * @dev The owner should ensure that the token enabled is a standard ERC20 token to ensure correct functionality.
     * @param stakedToken The address of the token that can be staked.
     * @param enabled Whether the token is enabled for staking.
     * @param baseEmissionRate The base emission rate for staking the token. This is split pro-rata between all users.
     * @param maxMultiplier The maximum multiplier for staking which increases your rewards the longer you stake.
     * @param secondsToMaxMultiplier The number of seconds needed to stake to reach the maximum multiplier.
     */
    function configureStakingToken(
        address stakedToken,
        bool enabled,
        uint256 baseEmissionRate,
        uint256 maxMultiplier,
        uint256 secondsToMaxMultiplier
    ) external onlyOwner {
        // Validate input to ensure system stability and avoid unexpected behavior. Note we don't place a lower bound on
        // the baseEmissionRate. If this value is less than 1e18 then you will slowly lose your staking rewards over
        // time. Because of the way balances are managed, the staked token cannot be the reward token. Otherwise, reward
        // payouts could eat into user balances. maxMultiplier is constrained to be at least 1e18 to enforce a minimum
        // 1x multiplier and avoid potential underflows.
        require(stakedToken != address(rewardToken), "Staked token is reward token");
        require(maxMultiplier <= 1e24, "maxMultiplier too large"); // 1_000_000x multiplier.
        require(maxMultiplier >= 1e18, "maxMultiplier less than 1e18");
        require(secondsToMaxMultiplier > 0, "secondsToMaxMultiplier is 0");
        require(baseEmissionRate <= 1e24, "baseEmissionRate too large"); // 1 million tokens per second.

        StakingToken storage stakingToken = stakingTokens[stakedToken];

        // If this token is already initialized, make sure we update the rewards before modifying any params.
        if (stakingToken.lastUpdateTime != 0) _updateReward(stakedToken, address(0));

        stakingToken.enabled = enabled;
        stakingToken.baseEmissionRate = baseEmissionRate;
        stakingToken.maxMultiplier = maxMultiplier;
        stakingToken.secondsToMaxMultiplier = secondsToMaxMultiplier;
        stakingToken.lastUpdateTime = getCurrentTime();

        emit TokenConfiguredForStaking(
            stakedToken,
            enabled,
            baseEmissionRate,
            maxMultiplier,
            secondsToMaxMultiplier,
            stakingToken.lastUpdateTime
        );
    }

    /**
     * @notice Enables the owner to recover tokens dropped onto the contract. This could be used to remove unclaimed
     * staking rewards or recover excess LP tokens that were inadvertently dropped onto the contract. Importantly, the
     * contract will only let the owner recover excess tokens above what the contract thinks it should have, i.e the
     * owner can't use this method to steal staked tokens, only recover excess ones mistakenly sent to the contract.
     * Emits a RecoverToken event on success.
     * @param token The address of the token to skim.
     */
    function recoverToken(address token) external onlyOwner {
        // If the token is an enabled staking token then we want to preform a skim action where we send back any extra
        // tokens that are not accounted for in the cumulativeStaked variable. This lets the owner recover extra tokens
        // sent to the contract that were not explicitly staked. If the token has not been initialized for staking then
        // we simply send back the full amount of tokens that the contract has.
        uint256 amount = IERC20(token).balanceOf(address(this));
        if (stakingTokens[token].lastUpdateTime != 0) amount -= stakingTokens[token].cumulativeStaked;
        require(amount > 0, "Can't recover 0 tokens");
        IERC20(token).safeTransfer(owner(), amount);
        emit RecoverToken(token, amount);
    }

    /**************************************
     *          STAKER FUNCTIONS          *
     **************************************/

    /**
     * @notice Stake tokens for rewards. Callable by any user. Fails when the specified amount is 0, or when the caller
     * can not successfully transfer the specified amount. Emits a Stake event on success.
     * @dev The caller of this function must approve this contract to spend amount of stakedToken.
     * @param stakedToken The address of the token to stake.
     * @param amount The amount of the token to stake.
     */
    function stake(address stakedToken, uint256 amount) external nonReentrant onlyEnabled(stakedToken) {
        _stake(stakedToken, amount, msg.sender);
    }

    /**
     * @notice Stake tokens on behalf of `beneficiary`. Callable by any user. Fails when the specified amount is 0, or
     * when the caller can not successfully transfer the specified amount. Emits a Stake event on success.
     * @dev The caller of this function must approve this contract to spend amount of stakedToken.
     * @dev The caller of this function is effectively donating their tokens to the beneficiary. The beneficiary
     * can then unstake or claim rewards as they wish.
     * @param stakedToken The address of the token to stake.
     * @param amount The amount of the token to stake.
     * @param beneficiary User that caller wants to stake on behalf of.
     */
    function stakeFor(
        address stakedToken,
        uint256 amount,
        address beneficiary
    ) external nonReentrant onlyEnabled(stakedToken) {
        require(beneficiary != address(0), "Invalid beneficiary");
        _stake(stakedToken, amount, beneficiary);
    }

    /**
     * @notice Withdraw staked tokens. Callable only by users with a staked balance. Fails when the specified amount is
     * 0, or is greater than the currently staked balance. Emits an Unstake event on success.
     * @param stakedToken The address of the token to withdraw.
     * @param amount The amount of the token to withdraw.
     */
    function unstake(address stakedToken, uint256 amount) public nonReentrant onlyInitialized(stakedToken) {
        require(amount > 0, "Invalid amount");

        _updateReward(stakedToken, msg.sender);
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[msg.sender];

        // Note: these will revert if underflow occurs, so you can't unstake more than your cumulativeBalance.
        userDeposit.cumulativeBalance -= amount;
        stakingTokens[stakedToken].cumulativeStaked -= amount;

        IERC20(stakedToken).safeTransfer(msg.sender, amount);

        emit Unstake(
            stakedToken,
            msg.sender,
            amount,
            userDeposit.cumulativeBalance,
            stakingTokens[stakedToken].cumulativeStaked
        );
    }

    /**
     * @notice Claim all rewards available to the caller. Callable by any user. Emits a RewardsWithdrawn event on
     * success.
     * @dev Calling this method will reset the caller's reward multiplier.
     * @param stakedToken The address of the token to get rewards for.
     */
    function withdrawReward(address stakedToken) public nonReentrant onlyInitialized(stakedToken) {
        _updateReward(stakedToken, msg.sender);
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[msg.sender];

        uint256 rewardsToSend = userDeposit.rewardsOutstanding;
        if (rewardsToSend > 0) {
            userDeposit.rewardsOutstanding = 0;
            userDeposit.averageDepositTime = getCurrentTime();
            rewardToken.safeTransfer(msg.sender, rewardsToSend);
        }

        emit RewardsWithdrawn(
            stakedToken,
            msg.sender,
            rewardsToSend,
            stakingTokens[stakedToken].lastUpdateTime,
            stakingTokens[stakedToken].rewardPerTokenStored,
            userDeposit.rewardsAccumulatedPerToken
        );
    }

    /**
     * @notice Claim all rewards available to the caller and exits their staking position. Callable by any user.
     * Emits Unstake, RewardsWithdrawn and Exit events on success.
     * @dev Calling this method will reset the caller's reward multiplier.
     * @param stakedToken The address of the token to get rewards for.
     */
    function exit(address stakedToken) external onlyInitialized(stakedToken) {
        _updateReward(stakedToken, msg.sender);
        unstake(stakedToken, stakingTokens[stakedToken].stakingBalances[msg.sender].cumulativeBalance);
        withdrawReward(stakedToken);

        emit Exit(stakedToken, msg.sender, stakingTokens[stakedToken].cumulativeStaked);
    }

    /**************************************
     *           VIEW FUNCTIONS           *
     **************************************/

    function getCurrentTime() public view virtual returns (uint256) {
        return block.timestamp; // solhint-disable-line not-rely-on-time
    }

    /**
     * @notice Returns the total staked for a given stakedToken.
     * @param stakedToken The address of the staked token to query.
     * @return uint256 Total amount staked of the stakedToken.
     */
    function getCumulativeStaked(address stakedToken) external view returns (uint256) {
        return stakingTokens[stakedToken].cumulativeStaked;
    }

    /**
     * @notice Returns all the information associated with a user's stake.
     * @param stakedToken The address of the staked token to query.
     * @param account The address of user to query.
     * @return UserDeposit Struct with: {cumulativeBalance,averageDepositTime,rewardsAccumulatedPerToken,rewardsOutstanding}
     */
    function getUserStake(address stakedToken, address account) external view returns (UserDeposit memory) {
        return stakingTokens[stakedToken].stakingBalances[account];
    }

    /**
     * @notice Returns the base rewards per staked token for a given staking token. This factors in the last time
     * any internal logic was called on this contract to correctly attribute retroactive cumulative rewards.
     * @dev This method should only be called by this contract and should actually be marked internal, but it
     * was originally audited and deployed with this function being public. Its useful for testing if this function is
     * public but it can return nonsensical values if the stakedToken precision is fewer than 18 decimals.
     * @dev the value returned is represented by a uint256 with fixed precision of (18 + 18 - X) decimals, where
     * X = decimals of the stakedToken. This is becauseof how the return value is divided by `cumulativeStaked`
     * which has the same precisionas stakedToken.
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
     * The longer a user stakes, the higher their multiplier up to maxMultiplier for that given staking token.
     * @dev maxMultiplier has a floor of 1e18 to avoid potential underflow on reward multiplier calculations.
     * @dev the value returned is represented by a uint256 with fixed precision of 18 decimals.
     * @param stakedToken The address of the staked token to query.
     * @param account The address of the user to query.
     * @return uint256 User multiplier, applied to the baseRewardPerToken, when claiming rewards.
     */
    function getUserRewardMultiplier(address stakedToken, address account) public view returns (uint256) {
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[account];
        if (userDeposit.averageDepositTime == 0 || userDeposit.cumulativeBalance == 0) return 1e18;
        uint256 fractionOfMaxMultiplier = ((getTimeSinceAverageDeposit(stakedToken, account)) * 1e18) /
            stakingTokens[stakedToken].secondsToMaxMultiplier;

        // At maximum, the multiplier should be equal to the maxMultiplier.
        if (fractionOfMaxMultiplier > 1e18) fractionOfMaxMultiplier = 1e18;
        return 1e18 + (fractionOfMaxMultiplier * (stakingTokens[stakedToken].maxMultiplier - 1e18)) / (1e18);
    }

    /**
     * @notice Returns the total outstanding rewards entitled to a user for a given staking token. This factors in the
     * user's staking duration (and therefore reward multiplier) and their pro-rata share of the total rewards.
     * @param stakedToken The address of the staked token to query.
     * @param account The address of the user to query.
     * @return uint256 Total outstanding rewards entitled to user.
     */
    function getOutstandingRewards(address stakedToken, address account) public view returns (uint256) {
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[account];

        uint256 userRewardMultiplier = getUserRewardMultiplier(stakedToken, account);

        uint256 newUserRewards = (userDeposit.cumulativeBalance *
            (baseRewardPerToken(stakedToken) - userDeposit.rewardsAccumulatedPerToken) *
            userRewardMultiplier) / (1e18 * 1e18);

        return newUserRewards + userDeposit.rewardsOutstanding;
    }

    /**
     * @notice Returns the time that has elapsed between the current time and the last user's average deposit time.
     * @param stakedToken The address of the staked token to query.
     * @param account The address of the user to query.
     * @return uint256 Time, in seconds, between the user's average deposit time and the current time.
     */
    function getTimeSinceAverageDeposit(address stakedToken, address account) public view returns (uint256) {
        return getCurrentTime() - stakingTokens[stakedToken].stakingBalances[account].averageDepositTime;
    }

    /**
     * @notice Returns a user's new average deposit time, considering the addition of a new deposit. This factors in the
     * cumulative previous deposits, new deposit and time from the last deposit.
     * @param stakedToken The address of the staked token to query.
     * @param account The address of the user to query.
     * @param amount Marginal amount of stakingToken to be deposited into the staking contract.
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
            (getTimeSinceAverageDeposit(stakedToken, account))) / 1e18;
        return userDeposit.averageDepositTime + amountWeightedTime;
    }

    /**************************************
     *         INTERNAL FUNCTIONS         *
     **************************************/

    /**
     * @notice Update global state for a given stakedToken. If a user address is supplied, update that user's rewards.
     * @param stakedToken The address of the staked token to update.
     * @param account The address of the user to update. Supplying address(0) will skip any user update.
     */
    function _updateReward(address stakedToken, address account) internal {
        StakingToken storage stakingToken = stakingTokens[stakedToken];
        stakingToken.rewardPerTokenStored = baseRewardPerToken(stakedToken);
        stakingToken.lastUpdateTime = getCurrentTime();
        if (account != address(0)) {
            UserDeposit storage userDeposit = stakingToken.stakingBalances[account];
            userDeposit.rewardsOutstanding = getOutstandingRewards(stakedToken, account);
            userDeposit.rewardsAccumulatedPerToken = stakingToken.rewardPerTokenStored;
        }
    }

    /**
     * @notice Deposit user funds of stakedToken into the staking contract.
     * @dev Rewards for any pre-existing staking balances are finalised prior to modifying user state.
     * @param stakedToken The address of the staked token to update.
     * @param amount Marginal amount of stakingToken to be deposited into the staking contract.
     * @param staker The address of the user depositing funds.
     */
    function _stake(
        address stakedToken,
        uint256 amount,
        address staker
    ) internal {
        require(amount > 0, "Invalid amount");
        _updateReward(stakedToken, staker);

        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[staker];

        uint256 averageDepositTime = getAverageDepositTimePostDeposit(stakedToken, staker, amount);

        userDeposit.averageDepositTime = averageDepositTime;
        userDeposit.cumulativeBalance += amount;
        stakingTokens[stakedToken].cumulativeStaked += amount;

        IERC20(stakedToken).safeTransferFrom(msg.sender, address(this), amount);
        emit Stake(
            stakedToken,
            staker,
            amount,
            averageDepositTime,
            userDeposit.cumulativeBalance,
            stakingTokens[stakedToken].cumulativeStaked
        );
    }
}

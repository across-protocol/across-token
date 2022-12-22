// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "../munged/AcceleratingDistributor.sol";

contract AcceleratingDistributorHarness is AcceleratingDistributor {
    
    constructor(address _rewardToken) 
        AcceleratingDistributor(_rewardToken) {}

    /** 
    // An external call to _updateReward
    **/
    function updateReward(address stakedToken, address account) external {
        _updateReward(stakedToken, account);
    }

    /** 
    // Getters:
    **/

    function tokenBalanceOf(IERC20 token, address user) external view returns (uint256) {
        return token.balanceOf(user);
    }

    function getBaseEmissionRatePerToken(address stakedToken) external view returns (uint256) {
        return stakingTokens[stakedToken].baseEmissionRate;
    }

    function getUserStakedBalance(address stakedToken, address account) external view returns(uint256) {
        UserDeposit storage deposit = stakingTokens[stakedToken].stakingBalances[account];
        return deposit.cumulativeBalance;
    }

    function getUserRewardsAccumulated(address stakedToken, address account) external view returns(uint256) {
        UserDeposit storage deposit = stakingTokens[stakedToken].stakingBalances[account];
        return deposit.rewardsAccumulatedPerToken;
    }

    function getRewardPerTokenStored(address stakedToken) external view returns (uint256) { 
        return stakingTokens[stakedToken].rewardPerTokenStored;
    }

    function getLastUpdateTimePerToken(address stakedToken) external view returns (uint256) { 
        return stakingTokens[stakedToken].lastUpdateTime;
    }

    /** 
    // Overriding functions. Inserted internal functions that mimic the original code.
    **/

    function baseRewardPerToken(address stakedToken) public override view returns (uint256) {
        StakingToken storage stakingToken = stakingTokens[stakedToken];
        if (stakingToken.cumulativeStaked == 0) return stakingToken.rewardPerTokenStored;
        
        return stakingToken.rewardPerTokenStored + 
            _mulDiv((getCurrentTime() - stakingToken.lastUpdateTime),
                    stakingToken.baseEmissionRate * 1e18,
                    stakingToken.cumulativeStaked);
    }

    function getUserRewardMultiplier(address stakedToken, address account) public override view returns (uint256) {
        UserDeposit storage userDeposit = stakingTokens[stakedToken].stakingBalances[account];
        if (userDeposit.averageDepositTime == 0 || userDeposit.cumulativeBalance == 0) return 1e18;
        return _getUserRewardMultiplier(stakedToken, account);
    }

    /** 
    Internal functions by Certora. The implementations are identical to the original code.
    The separation is done in order to allow summarization from CVL.
    **/

    function _getUserRewardMultiplier(address stakedToken, address account) internal view returns (uint256) {
        uint256 time = getTimeSinceAverageDeposit(stakedToken, account);
        uint256 fractionOfMaxMultiplier = _getFractionOfMaxMultiplier(time, stakedToken);

        // At maximum, the multiplier should be equal to the maxMultiplier.
        if (fractionOfMaxMultiplier > 1e18) fractionOfMaxMultiplier = 1e18;
        return 1e18 + (fractionOfMaxMultiplier * (stakingTokens[stakedToken].maxMultiplier - 1e18)) / (1e18);
    }

    function _getFractionOfMaxMultiplier(uint256 time, address stakedToken) internal view returns(uint256) {
        return (time * 1e18) / stakingTokens[stakedToken].secondsToMaxMultiplier;
    }

    function _mulDiv(uint256 x, uint256 y, uint256 z) internal pure returns(uint256) {
        return (x * y) / z;
    }
}
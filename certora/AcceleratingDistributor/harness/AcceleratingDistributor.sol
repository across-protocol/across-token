// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "../../../contracts/AcceleratingDistributor.sol";

contract AcceleratingDistributorHarness is AcceleratingDistributor {
    
    constructor(address _rewardToken) 
        AcceleratingDistributor(_rewardToken) {}


    function tokenBalanceOf(IERC20 token, address user) external view returns(uint256) {
        return token.balanceOf(user);
    }

    // Certora:  An external call to _updateReward
    function updateReward(address stakedToken, address account) external {
        _updateReward(stakedToken, account);
    }

    function getBaseEmissionRatePerToken(address stakedToken) external view returns(uint256) {
        return stakingTokens[stakedToken].baseEmissionRate;
    }

    function getUserStakedBalance(address stakedToken, address account) external view returns(uint256) {
        UserDeposit storage deposit = stakingTokens[stakedToken].stakingBalances[account];
        return deposit.cumulativeBalance;
    }
}
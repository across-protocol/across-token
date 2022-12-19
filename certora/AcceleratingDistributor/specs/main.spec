import "erc20.spec"
using AcrossToken as reward
using ERC20A as erc20A
/**************************************************
*      Top Level Properties / Rule Ideas         *
**************************************************/


/**************************************************
*                  Methods                       *
**************************************************/
methods {
    getCumulativeStaked(address) returns (uint256) envfree
    getUserStakedBalance(address, address) returns (uint256) envfree
    tokenBalanceOf(address, address) returns(uint256) envfree
    getBaseEmissionRatePerToken(address) returns(uint256) envfree
    owner() returns(address) envfree
    rewardToken() returns(address) envfree
}

/**************************************************
*                 CVL Definitions                *
**************************************************/
// Selector of the 'multiCall' method
definition isMultiCall(method f) returns bool = (f.selector == multicall(bytes[]).selector);

// Selector of methods that call 'withdrawReward'
definition withdrawRewardMethod(method f) returns bool = 
    f.selector == withdrawReward(address).selector || f.selector == exit(address).selector;

/**************************************************
*                 Ghosts & Hooks                 *
**************************************************/
// Tracks the sum of staking balances for all users, per token.
ghost mapping(address => mathint) sumOfStakingBalances {
    init_state axiom forall address token. sumOfStakingBalances[token] == 0;
}

// Tracks the sum of accumulated rewards for all users, per token.
ghost mapping(address => mathint) sumOfAccumulatedRewards {
    init_state axiom forall address token. sumOfAccumulatedRewards[token] == 0;
}

 // Hook : update sum of staking balances per token
hook Sstore stakingTokens[KEY address token].stakingBalances[KEY address user].cumulativeBalance 
uint256 value (uint256 old_value) STORAGE 
{
    sumOfStakingBalances[token] = sumOfStakingBalances[token] + value - old_value; 
}

 // Hook : update sum of accrued rewards per token
hook Sstore stakingTokens[KEY address token].stakingBalances[KEY address user].rewardsAccumulatedPerToken 
uint256 value (uint256 old_value) STORAGE 
{
    sumOfAccumulatedRewards[token] = sumOfAccumulatedRewards[token] + value - old_value; 
}
/**************************************************
*              MISC RULES                        *
**************************************************/
rule sanity(method f) {
    env e;
    calldataarg args;
    f(e, args);
    assert false;
}

rule viewFuncsDontRevert(method f) filtered {f -> f.isView} {
    env e;
    require e.msg.value == 0;
    calldataarg args;
    f@withrevert(e, args);
    assert !lastReverted;
}

/**************************************************
*              OWNERSHIP RULES                   *
**************************************************/
rule onlyOwnerCanChangeEmissionRate(method f, address stakedToken) 
filtered{f -> !isMultiCall(f) && !f.isView} {
    env e;
    calldataarg args;

    uint256 rateBefore = getBaseEmissionRatePerToken(stakedToken);
    f(e, args);
    uint256 rateAfter = getBaseEmissionRatePerToken(stakedToken);

    assert rateBefore != rateAfter => e.msg.sender == owner();
}

/**************************************************
*              REWARD RULES                      *
**************************************************/
// Checks that rewards could be distributed only by the 'withdrawReward' method
// and that the only recipient is the msg.sender.
// 
// Run this rule and see why it fails (hint : which token is the staked token?)
rule rewardsGivenOnlyByWithdrawReward(method f) 
filtered {f -> !f.isView} {
    env e;
    calldataarg args;
    address user;
    require user != currentContract;

    uint256 rewardBalanceUserBefore = tokenBalanceOf(rewardToken(), user);
    uint256 rewardBalanceContractBefore = tokenBalanceOf(rewardToken(), currentContract);
        f(e, args);
    uint256 rewardBalanceUserAfter = tokenBalanceOf(rewardToken(), user);
    uint256 rewardBalanceContractAfter = tokenBalanceOf(rewardToken(), currentContract);

    // Only the 'withdrawReward' method can withdraw rewards from the system.
    assert (rewardBalanceContractAfter < rewardBalanceContractBefore) => withdrawRewardMethod(f);

    // If we call that method, then the reward balance of the msg.sender only can change.
    assert (withdrawRewardMethod(f) && rewardBalanceUserAfter != rewardBalanceUserBefore) 
        => user == e.msg.sender;
}

// A "Fixed" version of the previous rule.
rule rewardsGivenOnlyByWithdrawReward_Fixed(method f, address stakedToken) {
    env e;
    calldataarg args;
    address user;
    require user != currentContract;
    require stakedToken != rewardToken();

    uint256 rewardBalanceUserBefore = tokenBalanceOf(rewardToken(), user);
    uint256 rewardBalanceContractBefore = tokenBalanceOf(rewardToken(), currentContract);
        specifyTokenAddressInMethod(e, f, stakedToken);
    uint256 rewardBalanceUserAfter = tokenBalanceOf(rewardToken(), user);
    uint256 rewardBalanceContractAfter = tokenBalanceOf(rewardToken(), currentContract);

    // Only the 'withdrawReward' method can withdraw rewards from the system.
    assert (rewardBalanceContractAfter < rewardBalanceContractBefore) => withdrawRewardMethod(f);

    // If we call that method, then the reward balance of the msg.sender only can change.
    assert (withdrawRewardMethod(f) && rewardBalanceUserAfter != rewardBalanceUserBefore) 
        => user == e.msg.sender;
}


/**************************************************
*              STAKING RULES                     *
**************************************************/
// Verified
invariant cumulativeStakedEqualsSumOfStakes(address token)
    sumOfStakingBalances[token] == getCumulativeStaked(token)
    filtered{f -> !isMultiCall(f)}

// Fails for `recoverToken()` function.
invariant cumulativeStakedEqualsContractBalance(address token)
    token != rewardToken() =>
    getCumulativeStaked(token) == tokenBalanceOf(token, currentContract)
    filtered{f -> !isMultiCall(f)}
    {
        // Everything inside a preserved block is required 
        // for all methods before they are invoked.
        preserved with (env e) {
            require e.msg.sender != currentContract;
        }
    }

// Rule in-progress [TIMEOUT]
rule exitCannotBeFrontRunned_Exit(address stakedToken) {
    env e1;
    env e2;
    require e1.msg.sender != e2.msg.sender;
    requireInvariant cumulativeStakedEqualsSumOfStakes(stakedToken);
    require (getUserStakedBalance(stakedToken, e1.msg.sender) + 
            getUserStakedBalance(stakedToken, e2.msg.sender) <= 
            sumOfStakingBalances[stakedToken]);

    require stakedToken == erc20A;
    require e2.block.timestamp == e1.block.timestamp;

    // Initial state of the system before exit()
    storage initStorage = lastStorage;
    
    // Some msg.sender can call exit (without reverting):
    exit(e2, stakedToken);

    // Now we check that two consecutive calls are possible:
    exit(e1, stakedToken) at initStorage;
    exit@withrevert(e2, stakedToken);

    assert !lastReverted;
}

// Rule in-progress [TIMEOUT]
rule exitCannotBeFrontRunned_RecoverToken(address stakedToken) {
    env e1;
    env e2;
    requireInvariant cumulativeStakedEqualsSumOfStakes(stakedToken);
    require getUserStakedBalance(stakedToken, e2.msg.sender) <=
            sumOfStakingBalances[stakedToken];

    require stakedToken == erc20A;
    require e2.block.timestamp == e1.block.timestamp;

    // Initial state of the system before exit()
    storage initStorage = lastStorage;
    
    // Some msg.sender can call exit (without reverting):
    exit(e2, stakedToken);

    // We first call recoverToken and then check that exit doesn't revert.
    recoverToken(e1, stakedToken) at initStorage;
    exit@withrevert(e2, stakedToken);

    assert !lastReverted;
}


/**************************************************
*              CVL HELPER FUNCS                   *
**************************************************/

// A helper function for calling a general method [f] in the contract, and 
// specifying the token input [token].
function specifyTokenAddressInMethod(env e, method f, address token) {
    calldataarg args;
    uint256 amount;
    address someUser;

    // Here we "switch-case" the interesting methods :
    if(f.selector == exit(address).selector) {
        exit(e, token);
    }
    else if(f.selector == unstake(address,uint256).selector) {
        unstake(e, token, amount);
    }
    else if(f.selector == recoverToken(address).selector) {
        recoverToken(e, token);
    }
    else if(f.selector == stakeFor(address,uint256,address).selector) {
        stakeFor(e, token, amount, someUser);
    }
    else if(f.selector == stake(address,uint256).selector) {
        stake(e, token, amount);
    }
    else { // "default"
        f(e, args);
    }
}  

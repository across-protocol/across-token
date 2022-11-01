// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";
import "@uma/core/contracts/merkle-distributor/implementation/MerkleDistributorInterface.sol";
import "./AcceleratingDistributor.sol";

/**
 * @notice Across token distribution contract. Contract is inspired by Synthetix staking contract and Ampleforth geyser.
 * Stakers start by earning their pro-rata share of a baseEmissionRate per second which increases based on how long
 * they have staked in the contract, up to a max emission rate of baseEmissionRate * maxMultiplier. Multiple LP tokens
 * can be staked in this contract enabling depositors to batch stake and claim via multicall. Note that this contract is
 * only compatible with standard ERC20 tokens, and not tokens that charge fees on transfers, dynamically change
 * balance, or have double entry-points. It's up to the contract owner to ensure they only add supported tokens.
 */

contract AcceleratingDistributorClaimAndStake is AcceleratingDistributor {
    // Contract which rewards tokens to users that they can then stake. MerkleDistributor logic does not impact
    // this contract at all, but its stored here for convenience to allow claimAndStake to be called by a user to
    // claim their staking tokens and stake atomically.
    MerkleDistributorInterface public merkleDistributor;

    /**************************************
     *               EVENTS               *
     **************************************/

    event SetMerkleDistributor(address indexed newMerkleDistributor);

    constructor(address _rewardToken) AcceleratingDistributor(_rewardToken) {}

    /**************************************
     *          ADMIN FUNCTIONS           *
     **************************************/

    /**
     * @notice Resets merkle distributor contract called in claimAndStake()
     * @param _merkleDistributor Address to set merkleDistributor to.
     */
    function setMerkleDistributor(address _merkleDistributor) external onlyOwner {
        merkleDistributor = MerkleDistributorInterface(_merkleDistributor);
        emit SetMerkleDistributor(_merkleDistributor);
    }

    /**************************************
     *          STAKER FUNCTIONS          *
     **************************************/

    /**
     * @notice Claim tokens from a MerkleDistributor contract and stake them for rewards.
     * @dev Will revert if `merkleDistributor` is not set to valid MerkleDistributor contract.
     * @dev Will revert if any of the claims recipient accounts are not equal to caller, or if any reward token
     *      for claim is not a valid staking token or are not the same token as the other claims.
     * @dev The caller of this function must approve this contract to spend total amount of stakedToken.
     * @param claims Claim leaves to retrieve from MerkleDistributor.
     * @param stakedToken The address of the token to stake.
     */
    function claimAndStake(MerkleDistributorInterface.Claim[] memory claims, address stakedToken)
        external
        nonReentrant
        onlyEnabled(stakedToken)
    {
        uint256 batchedAmount;
        uint256 claimCount = claims.length;
        for (uint256 i = 0; i < claimCount; i++) {
            MerkleDistributorInterface.Claim memory _claim = claims[i];
            require(_claim.account == msg.sender, "claim account not caller");
            require(
                merkleDistributor.getRewardTokenForWindow(_claim.windowIndex) == stakedToken,
                "unexpected claim token"
            );
            batchedAmount += _claim.amount;
        }
        merkleDistributor.claimMulti(claims);
        _stake(stakedToken, batchedAmount, msg.sender);
    }
}

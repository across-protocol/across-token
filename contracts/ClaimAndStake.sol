// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Multicall.sol";
import "@uma/core/contracts/merkle-distributor/implementation/MerkleDistributorInterface.sol";

interface AcceleratingDistributorInterface {
    function stakeFor(
        address beneficiary,
        address stakedToken,
        uint256 amount
    ) external;
}

interface AcrossMerkleDistributorInterface is MerkleDistributorInterface {
    function claimFor(MerkleDistributorInterface.Claim memory _claim) external;
}

/**
 * @notice Allows claimer to claim tokens from AcrossMerkleDistributor and stake into AcceleratingDistributor
 * atomically in a single transaction. This intermediary contract also removes the need for claimer to approve
 * AcceleratingDistributor to spend its staking tokens.
 */

contract ClaimAndStake is ReentrancyGuard, Ownable, Multicall {
    using SafeERC20 for IERC20;

    // Contract which rewards tokens to users that they can then stake.
    AcrossMerkleDistributorInterface public immutable merkleDistributor;

    // Contract that user stakes claimed tokens into.
    AcceleratingDistributorInterface public immutable acceleratingDistributor;

    constructor(
        AcrossMerkleDistributorInterface _merkleDistributor,
        AcceleratingDistributorInterface _acceleratingDistributor
    ) {
        merkleDistributor = _merkleDistributor;
        acceleratingDistributor = _acceleratingDistributor;
    }

    /**************************************
     *          ADMIN FUNCTIONS           *
     **************************************/

    /**
     * @notice Claim tokens from a MerkleDistributor contract and stake them for rewards in AcceleratingDistributor.
     * @dev Will revert if `merkleDistributor` is not set to valid MerkleDistributor contract.
     * @dev Will revert if the claim recipient account is not equal to caller, or if the reward token
     *      for claim is not a valid staking token.
     * @dev Will revert if this contract is not a "whitelisted claimer" on the MerkleDistributor contract.
     * @param _claim Claim leaf to retrieve from MerkleDistributor.
     */
    function claimAndStake(MerkleDistributorInterface.Claim memory _claim) external nonReentrant {
        require(_claim.account == msg.sender, "claim account not caller");
        address stakedToken = merkleDistributor.getRewardTokenForWindow(_claim.windowIndex);
        merkleDistributor.claimFor(_claim);
        IERC20(stakedToken).safeIncreaseAllowance(address(acceleratingDistributor), _claim.amount);
        acceleratingDistributor.stakeFor(msg.sender, stakedToken, _claim.amount);
    }
}

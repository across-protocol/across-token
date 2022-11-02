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
    AcrossMerkleDistributorInterface public merkleDistributor;

    // Contract that user stakes claimed tokens into.
    AcceleratingDistributorInterface public acceleratingDistributor;

    /**************************************
     *               EVENTS               *
     **************************************/
    event SetMerkleDistributor(AcrossMerkleDistributorInterface indexed newMerkleDistributor);
    event SetAcceleratingDistributor(AcceleratingDistributorInterface indexed newAcceleratingDistributor);

    constructor() {}

    /**************************************
     *          ADMIN FUNCTIONS           *
     **************************************/

    /**
     * @notice Sets merkle and accelerating distributor contracts called in claimAndStake.
     * @param _merkleDistributor Address to set merkleDistributor to.
     * @param _acceleratingDistributor Address to set acceleratingDistributor to.
     */
    function setDistributorContracts(
        AcrossMerkleDistributorInterface _merkleDistributor,
        AcceleratingDistributorInterface _acceleratingDistributor
    ) external nonReentrant onlyOwner {
        merkleDistributor = _merkleDistributor;
        acceleratingDistributor = _acceleratingDistributor;
        emit SetMerkleDistributor(_merkleDistributor);
        emit SetAcceleratingDistributor(_acceleratingDistributor);
    }

    /**
     * @notice Claim tokens from a MerkleDistributor contract and stake them for rewards in AcceleratingDistributor.
     * @dev Will revert if `merkleDistributor` is not set to valid MerkleDistributor contract.
     * @dev Will revert if the claim recipient account is not equal to caller, or if the reward token
     *      for claim is not a valid staking token.
     * @dev Will revert if this contract is not a "whitelisted claimer" on the MerkleDistributor contract.
     * @param _claim Claim leaf to retrieve from MerkleDistributor.
     * @param stakedToken The address of the token to stake.
     */
    function claimAndStake(MerkleDistributorInterface.Claim memory _claim, address stakedToken) external nonReentrant {
        require(_claim.account == msg.sender, "claim account not caller");
        require(merkleDistributor.getRewardTokenForWindow(_claim.windowIndex) == stakedToken, "unexpected claim token");
        merkleDistributor.claimFor(_claim);
        IERC20(stakedToken).safeApprove(address(acceleratingDistributor), _claim.amount);
        acceleratingDistributor.stakeFor(msg.sender, stakedToken, _claim.amount);
    }
}

// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "../AcceleratingDistributorClaimAndStake.sol";
import "./Testable.sol";

/**
 * @notice // Tesable version of the AcceleratingDistributor that enables time to be overridden with a Testable contract.
 */

contract AcceleratingDistributor_Testable is AcceleratingDistributorClaimAndStake, Testable {
    constructor(address _rewardToken, address _timer)
        AcceleratingDistributorClaimAndStake(_rewardToken)
        Testable(_timer)
    {}

    function getCurrentTime() public view override(AcceleratingDistributor, Testable) returns (uint256) {
        return Testable.getCurrentTime();
    }
}

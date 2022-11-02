// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "../AcceleratingDistributor.sol";
import "./Testable.sol";

/**
 * @notice // Testable version of the AcceleratingDistributor that enables time to be overridden with a Testable contract.
 */

contract AcceleratingDistributor_Testable is AcceleratingDistributor, Testable {
    constructor(address _rewardToken, address _timer) AcceleratingDistributor(_rewardToken) Testable(_timer) {}

    function getCurrentTime() public view override(AcceleratingDistributor, Testable) returns (uint256) {
        return Testable.getCurrentTime();
    }
}

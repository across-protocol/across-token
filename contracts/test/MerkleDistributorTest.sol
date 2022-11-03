// SPDX-License-Identifier: GPL-3.0-only
import "@across-protocol/contracts-v2/contracts/merkle-distributor/AcrossMerkleDistributor.sol";

pragma solidity ^0.8.0;

/// @notice Pass through contract that allows tests to access MerkleDistributor from /artifacts via
//          utils.getContractFactory()
contract MerkleDistributorTest is AcrossMerkleDistributor {

}

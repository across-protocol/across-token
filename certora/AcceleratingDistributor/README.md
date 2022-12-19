## Verification Overview
The current directory contains Certora's formal verification of UMA accelerating distributor contract.
In this directory you will find three subdirectories:

1. specs - Contains all the specification files that were written by Certora for the asserter contract verification.

- `main.spec`  - The main specification file for the distributor contract.
Contains everything needed for the verification of the contract. Includes methods block, definitions, CVL functions, rules etc.
- `erc20.spec` contains a methods block that dispatches all erc20 interface functions.

2. scripts - Contains the necessary run scripts to execute the spec files on the Certora Prover. These scripts are composed of a run-command of the Certora Prover contracts to take into account in the verification context, declaration of the compiler and a set of additional settings. 
- `verifyAD.sh` is a script for running of the `main.spec` on the  `AcceleratingDistributor.sol` contract.

The script includes two additional ERC20 contracts `./contracts/test/TestToken.sol \` and `harness/ERC20A.sol` which inherit from the OZ ERC20 contract.
They might be fetched as implementations of ERC20 interface inside the verfication scope.

3. harness - Contains all the inheriting contracts that add/simplify functionalities to the original contract, together with our own Mock contracts

We use one harnessed file:
- `AcceleratingDistributor.sol` - the main contract that is verified. Inherits from the original `AcceleratingDistributor` contract. This file contains simple getter functions for easier use through CVL. Also a wrapper for `_updateReward` was added.

Note: the `rewardToken` IERC20 variable inside the main contract is linked to the contract `./contracts/AcrossToken.sol`. This means that the only implementation for this variable will be the `AcrossToken` contract.

You may add any additional mock contracts to this folder, and import them to the running script. Simply add their relative path to the first part of script file, where you would see the list of all Solidity files used by the tool.
If the mock file's name is different than the name of the contract it holds,
simply add a ':' after the name of the file and then the name of the contract. e.g.
`.certora/AcceleratingDistributor/harness/myFile.sol:myContract`.

</br>

---

## Running Instructions
To run a verification job:

1. Open terminal and `cd` your way to the UMA/packages/core directory.

2. Run the script you'd like to get results for:
    ```
    sh certora/AcceleratingDistributor/scripts/verifyAsserter.sh
    ```
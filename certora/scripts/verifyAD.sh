certoraRun ./certora/harness/AcceleratingDistributor.sol:AcceleratingDistributorHarness \
            ./certora/harness/ERC20A.sol \
            ./contracts/test/TestToken.sol \
            ./contracts/AcrossToken.sol \
\
\
--verify AcceleratingDistributorHarness:./certora/specs/main.spec \
\
\
--link AcceleratingDistributorHarness:rewardToken=AcrossToken \
\
\
--packages @openzeppelin=node_modules/@openzeppelin \
--solc solc8.16 \
--send_only \
--staging \
--settings -mediumTimeout=150 \
--loop_iter 2 \
--optimistic_loop \
--rule exitCannotBeFrontRunned_RecoverToken \
--msg "UMA : Accelerating Distributor - exitCannotBeFrontRunned_RecoverToken" 

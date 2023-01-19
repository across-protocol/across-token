certoraRun ./certora/AcceleratingDistributor/harness/AcceleratingDistributor.sol:AcceleratingDistributorHarness \
            ./certora/AcceleratingDistributor/harness/ERC20A.sol \
            ./contracts/test/TestToken.sol \
            ./contracts/AcrossToken.sol \
\
\
--verify AcceleratingDistributorHarness:./certora/AcceleratingDistributor/specs/main.spec \
\
\
--link AcceleratingDistributorHarness:rewardToken=AcrossToken \
\
\
--packages @openzeppelin=node_modules/@openzeppelin \
--solc solc8.16 \
--send_only \
--cloud \
--settings -mediumTimeout=150,-depth=15 \
--loop_iter 2 \
--optimistic_loop \
--msg "UMA : Accelerating Distributor" 

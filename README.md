# Across Distributor

The Across token distributor facilitates the ACX liquidity mining program that will accompany the launch of the protocol. It is heavily inspired by the Synthetix [StakingRewards.sol](https://github.com/Synthetixio/synthetix/blob/v2.66.2/contracts/StakingRewards.sol) contract, with a number of modifications. The contract will be owned by the Across DAO multisig which will govern parameters such as the whitelisting of new tokens to stake and the configuration thereof.

The core logic of the contract enables stakers to lock up enabled LP tokens to earn rewards. At deposit time depositors earn a fixed base emission rate. The longer they remain staked the higher the reward rate they earn by a reward multiplier (similar to an Ampleforth Geyser). The reward multiplier is capped to some max multiplier, set by the owner of the distributor. Sequential deposits result in an average deposit time as a weighted average of previous deposits. If at any point the depositor claims their rewards their multiplier is reset. Unstaking LP tokens does not reset their multiplier or change their average deposit time, unless all LP tokens are unstaked in which case the multiplier is reset to 0.

The contract is designed to hold multiple LP tokens with independent parameterization for each liquidity mining. This is done to enable the depositor to take advantage of multicall when depositing, claiming rewards and unstaking (i.e you can stake multiple tokens at once).

## Build

```shell
yarn
yarn hardhat compile
```

## Test

```shell
yarn test # Run unit tests without gas analysis
yarn test:gas-analytics # Run only tests that count gas costs
yarn test:report-gas # Run unit tests with hardhat-gas-reporter enabled
```

## Lint

```shell
yarn lint
yarn lint-fix
```

## Deploy and Verify

```shell
NODE_URL_5=https://goerli.infura.com/xxx yarn hardhat deploy --network goerli
ETHERSCAN_API_KEY=XXX yarn hardhat etherscan-verify --network goerli --license AGPL-3.0 --force-license --solc-input
```

# Across Token

## Addresses

- Ethereum: [0x44108f0223A3C3028F5Fe7AEC7f9bb2E66beF82F](https://etherscan.io/address/0x44108f0223A3C3028F5Fe7AEC7f9bb2E66beF82F)
- Optimism: [0xFf733b2A3557a7ed6697007ab5D11B79FdD1b76B](https://optimistic.etherscan.io/address/0xFf733b2A3557a7ed6697007ab5D11B79FdD1b76B)
- Arbitrum: [0x53691596d1BCe8CEa565b84d4915e69e03d9C99d](https://arbiscan.io/address/0x53691596d1BCe8CEa565b84d4915e69e03d9C99d)
- Boba: [0x96821b258955587069F680729cD77369C0892B40](https://bobascan.com/address/0x96821b258955587069f680729cd77369c0892b40)
- Polygon: [0xF328b73B6c685831F238c30a23Fc19140CB4D8FC](https://polygonscan.com/token/0xf328b73b6c685831f238c30a23fc19140cb4d8fc)

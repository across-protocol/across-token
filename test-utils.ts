// Note: this file sits on a separate export path and is intended to export test utilities and code:
// You can import it like this: import * as testUtils from "@across-protocol/contracts-v2/dist/test-utils".
// This is separated because this code assumes the caller has a hardhat config because it imports
// hardhat. For non-test code, import the standard index file:
// import * as across-token from "@across-protocol/across-token"
export * from "./test/AcceleratingDistributor.Fixture";
export * from "./test/constants";
export * from "./test/utils";

import { Contract } from "./utils";
export declare const acrossDistributorFixture: (options?: unknown) => Promise<{
  timer: Contract;
  acrossToken: Contract;
  distributor: Contract;
  lpToken1: Contract;
  lpToken2: Contract;
}>;

import {
  QueriesSetBase,
  ChainGetter,
  QuerySharedContext,
} from "@keplr-wallet/stores";
import { ObservableQueryEthAccountBalanceRegistry } from "./balance";
import { DeepReadonly } from "utility-types";
import { ObservableQueryEthereumBlock } from "./block";
import { ObservableQueryEthereumFeeHistory } from "./fee-histroy";
import { ObservableQueryEVMChainERC20Metadata } from "./erc20-metadata";
import { ObservableQueryERC20ContractInfo } from "./erc20-contract-info";
import { ObservableQueryThirdpartyERC20BalanceRegistry } from "./erc20-balances";

export interface EthereumQueries {
  ethereum: EthereumQueriesImpl;
}

export const EthereumQueries = {
  use(options: {
    thirdpartyEndpoint: string;
  }): (
    queriesSetBase: QueriesSetBase,
    sharedContext: QuerySharedContext,
    chainId: string,
    chainGetter: ChainGetter
  ) => EthereumQueries {
    return (
      queriesSetBase: QueriesSetBase,
      sharedContext: QuerySharedContext,
      chainId: string,
      chainGetter: ChainGetter
    ) => {
      return {
        ethereum: new EthereumQueriesImpl(
          queriesSetBase,
          sharedContext,
          chainId,
          chainGetter,
          options.thirdpartyEndpoint
        ),
      };
    };
  },
};

export class EthereumQueriesImpl {
  public readonly queryEthereumBlock: DeepReadonly<ObservableQueryEthereumBlock>;
  public readonly queryEthereumFeeHistory: DeepReadonly<ObservableQueryEthereumFeeHistory>;
  public readonly queryEthereumERC20Metadata: DeepReadonly<ObservableQueryEVMChainERC20Metadata>;
  public readonly queryEthereumERC20ContractInfo: DeepReadonly<ObservableQueryERC20ContractInfo>;

  constructor(
    base: QueriesSetBase,
    sharedContext: QuerySharedContext,
    protected chainId: string,
    protected chainGetter: ChainGetter,
    protected thirdpartyEndpoint: string
  ) {
    base.queryBalances.addBalanceRegistry(
      new ObservableQueryThirdpartyERC20BalanceRegistry(
        sharedContext,
        thirdpartyEndpoint
      )
    );
    base.queryBalances.addBalanceRegistry(
      new ObservableQueryEthAccountBalanceRegistry(
        sharedContext,
        thirdpartyEndpoint
      )
    );

    this.queryEthereumBlock = new ObservableQueryEthereumBlock(
      sharedContext,
      chainId,
      chainGetter
    );

    this.queryEthereumFeeHistory = new ObservableQueryEthereumFeeHistory(
      sharedContext,
      chainId,
      chainGetter
    );

    this.queryEthereumERC20Metadata = new ObservableQueryEVMChainERC20Metadata(
      sharedContext,
      chainId,
      chainGetter
    );

    this.queryEthereumERC20ContractInfo = new ObservableQueryERC20ContractInfo(
      sharedContext,
      chainId,
      chainGetter
    );
  }
}

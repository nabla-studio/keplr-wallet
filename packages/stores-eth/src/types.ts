export interface ERC20ContractInfo {
  decimals: number;
  symbol: string;
  name: string;
  logo?: string;
}

export interface AnkrTokenBalance {
  assets: [
    {
      balance: string;
      balanceRawInteger: string;
      balanceUsd: string;
      blockchain: string;
      contractAddress: string;
      holderAddress: string;
      thumbnail: string;
      tokenDecimals: string;
      tokenName: string;
      tokenPrice: string;
      tokenSymbol: string;
      tokenType: string;
    }
  ];
  // TODO: Handle pagination.
  nextPageToken: string;
  totalBalanceUsd: string;
}

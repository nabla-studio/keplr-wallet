export interface ResMsgsHistory {
  msgs: {
    msg: ResMsg;
    prices?: Record<string, number | undefined>;
  }[];
}

export interface ResMsg {
  txHash: string;
  code: number;

  height: number;
  time: string;
  chainId: string;
  chainIdentifier: string;

  relation: string;
  msgIndex: number;
  msg: unknown;
  eventStartIndex: number;
  eventEndIndex: number;

  search: string;
  denoms?: string[];
}

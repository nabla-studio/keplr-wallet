import React, {
  FunctionComponent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {observer} from 'mobx-react-lite';
import {Box} from '../../../components/box';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
} from 'react-native';
import {useStyle} from '../../../styles';
import {RegisterHeader} from '../../../components/pageHeader/header-register';
import {FormattedMessage, useIntl} from 'react-intl';
import {TextInput} from '../../../components/input';
import {SearchIcon} from '../../../components/icon';
import {Gutter} from '../../../components/gutter';
import {RouteProp, useNavigation, useRoute} from '@react-navigation/native';
import {RootStackParamList, StackNavProp} from '../../../navigation';
import {useStore} from '../../../stores';
import {useEffectOnce} from '../../../hooks';
import {WalletStatus} from '@keplr-wallet/stores';
import {ChainIdHelper} from '@keplr-wallet/cosmos';
import {KeyRingCosmosService} from '@keplr-wallet/background';
import {CoinPretty, Dec} from '@keplr-wallet/unit';
import {ChainInfo} from '@keplr-wallet/types';
import {XAxis, YAxis} from '../../../components/axis';
import FastImage from 'react-native-fast-image';
import {Checkbox} from '../../../components/checkbox';
import {Button} from '../../../components/button';

export const EnableChainsScreen: FunctionComponent = observer(() => {
  const intl = useIntl();
  const style = useStyle();
  const route =
    useRoute<RouteProp<RootStackParamList, 'Register.EnableChain'>>();

  const navigation = useNavigation<StackNavProp>();

  const {accountStore, chainStore, keyRingStore, priceStore, queriesStore} =
    useStore();

  const {
    vaultId,
    candidateAddresses: propCandidateAddresses,
    isFresh,
    skipWelcome,
    initialSearchValue,
    fallbackEthereumLedgerApp,
    stepPrevious,
    stepTotal,
    password,
  } = route.params;

  const [search, setSearch] = useState<string>(initialSearchValue ?? '');
  const [candidateAddresses, setCandidateAddresses] = useState<
    {
      chainId: string;
      bech32Addresses: {
        coinType: number;
        address: string;
      }[];
    }[]
  >(propCandidateAddresses ?? []);

  const keyType = useMemo(() => {
    const keyInfo = keyRingStore.keyInfos.find(
      keyInfo => keyInfo.id === vaultId,
    );
    if (!keyInfo) {
      throw new Error('KeyInfo not found');
    }

    return keyInfo.type;
  }, [keyRingStore.keyInfos, vaultId]);

  useEffectOnce(() => {
    if (candidateAddresses.length === 0) {
      (async () => {
        // TODO: 이거 뭔가 finalize-key scene이랑 공통 hook 쓸 수 잇게 하던가 함수를 공유해야할 듯...?
        const candidateAddresses: {
          chainId: string;
          bech32Addresses: {
            coinType: number;
            address: string;
          }[];
        }[] = [];

        const promises: Promise<unknown>[] = [];
        for (const chainInfo of chainStore.chainInfos) {
          if (keyRingStore.needKeyCoinTypeFinalize(vaultId, chainInfo)) {
            promises.push(
              (async () => {
                const res = await keyRingStore.computeNotFinalizedKeyAddresses(
                  vaultId,
                  chainInfo.chainId,
                );

                candidateAddresses.push({
                  chainId: chainInfo.chainId,
                  bech32Addresses: res.map(res => {
                    return {
                      coinType: res.coinType,
                      address: res.bech32Address,
                    };
                  }),
                });
              })(),
            );
          } else {
            const account = accountStore.getAccount(chainInfo.chainId);
            promises.push(
              (async () => {
                if (account.walletStatus !== WalletStatus.Loaded) {
                  await account.init();
                }

                if (account.bech32Address) {
                  candidateAddresses.push({
                    chainId: chainInfo.chainId,
                    bech32Addresses: [
                      {
                        coinType: chainInfo.bip44.coinType,
                        address: account.bech32Address,
                      },
                    ],
                  });
                }
              })(),
            );
          }
        }

        await Promise.allSettled(promises);

        setCandidateAddresses(candidateAddresses);
      })();
    }
  });

  const candidateAddressesMap = useMemo(() => {
    const map: Map<
      string,
      {
        coinType: number;
        address: string;
      }[]
    > = new Map();
    for (const candidateAddress of candidateAddresses) {
      map.set(
        ChainIdHelper.parse(candidateAddress.chainId).identifier,
        candidateAddress.bech32Addresses,
      );
    }
    return map;
  }, [candidateAddresses]);

  // Select derivation scene으로 이동한 후에는 coin type을 여기서 자동으로 finalize 하지 않도록 보장한다.
  const sceneMovedToSelectDerivation = useRef(false);

  // Handle coin type selection.
  useEffect(() => {
    if (!isFresh && candidateAddresses.length > 0) {
      for (const candidateAddress of candidateAddresses) {
        const queries = queriesStore.get(candidateAddress.chainId);
        const chainInfo = chainStore.getChain(candidateAddress.chainId);

        if (keyRingStore.needKeyCoinTypeFinalize(vaultId, chainInfo)) {
          if (candidateAddress.bech32Addresses.length === 1) {
            // finalize-key scene을 통하지 않고도 이 scene으로 들어올 수 있는 경우가 있기 때문에...
            keyRingStore.finalizeKeyCoinType(
              vaultId,
              candidateAddress.chainId,
              candidateAddress.bech32Addresses[0].coinType,
            );
          }

          if (candidateAddress.bech32Addresses.length >= 2) {
            (async () => {
              const promises: Promise<unknown>[] = [];

              for (const bech32Address of candidateAddress.bech32Addresses) {
                const queryAccount =
                  queries.cosmos.queryAccount.getQueryBech32Address(
                    bech32Address.address,
                  );

                promises.push(queryAccount.waitResponse());
              }

              await Promise.allSettled(promises);

              const mainAddress = candidateAddress.bech32Addresses.find(
                a => a.coinType === chainInfo.bip44.coinType,
              );
              const otherAddresses = candidateAddress.bech32Addresses.filter(
                a => a.coinType !== chainInfo.bip44.coinType,
              );

              let otherIsSelectable = false;
              if (mainAddress && otherAddresses.length > 0) {
                for (const otherAddress of otherAddresses) {
                  const bech32Address = otherAddress.address;
                  const queryAccount =
                    queries.cosmos.queryAccount.getQueryBech32Address(
                      bech32Address,
                    );

                  // Check that the account exist on chain.
                  // With stargate implementation, querying account fails with 404 status if account not exists.
                  // But, if account receives some native tokens, the account would be created and it may deserve to be chosen.
                  if (
                    queryAccount.response?.data &&
                    queryAccount.error == null
                  ) {
                    otherIsSelectable = true;
                    break;
                  }
                }
              }

              if (
                !otherIsSelectable &&
                mainAddress &&
                !sceneMovedToSelectDerivation.current
              ) {
                console.log(
                  'Finalize key coin type',
                  vaultId,
                  chainInfo.chainId,
                  mainAddress.coinType,
                );
                keyRingStore.finalizeKeyCoinType(
                  vaultId,
                  chainInfo.chainId,
                  mainAddress.coinType,
                );
              }
            })();
          }
        }
      }
    }
  }, [
    isFresh,
    candidateAddresses,
    vaultId,
    chainStore,
    queriesStore,
    keyRingStore,
  ]);

  const [enabledChainIdentifiers, setEnabledChainIdentifiers] = useState(() => {
    // We assume that the chain store can be already initialized.
    // candidateAddresses가 prop으로 제공되지 않으면 얘는 무조건 초기값을 가진다.
    // useState의 initial state 기능을 사용해서 이를 보장한다는 점을 참고...
    const enabledChainIdentifiers: string[] =
      chainStore.enabledChainIdentifiers;

    for (const candidateAddress of candidateAddresses) {
      const queries = queriesStore.get(candidateAddress.chainId);
      const chainInfo = chainStore.getChain(candidateAddress.chainId);

      // If the chain is already enabled, skip.
      if (chainStore.isEnabledChain(candidateAddress.chainId)) {
        continue;
      }

      // If the chain is not enabled, check that the account exists.
      // If the account exists, turn on the chain.
      for (const bech32Address of candidateAddress.bech32Addresses) {
        // Check that the account has some assets or delegations.
        // If so, enable it by default
        const queryBalance = queries.queryBalances
          .getQueryBech32Address(bech32Address.address)
          .getBalance(chainInfo.stakeCurrency || chainInfo.currencies[0]);

        if (queryBalance?.response?.data) {
          // A bit tricky. The stake coin is currently only native, and in this case,
          // we can check whether the asset exists or not by checking the response.
          const data = queryBalance.response.data as any;
          if (
            data.balances &&
            Array.isArray(data.balances) &&
            data.balances.length > 0
          ) {
            enabledChainIdentifiers.push(chainInfo.chainIdentifier);
            break;
          }
        }

        const queryDelegations =
          queries.cosmos.queryDelegations.getQueryBech32Address(
            bech32Address.address,
          );
        if (queryDelegations.delegationBalances.length > 0) {
          enabledChainIdentifiers.push(chainInfo.chainIdentifier);
          break;
        }
      }
    }

    return enabledChainIdentifiers;
  });

  const enabledChainIdentifierMap = useMemo(() => {
    const map = new Map<string, boolean>();

    for (const enabledChainIdentifier of enabledChainIdentifiers) {
      map.set(enabledChainIdentifier, true);
    }

    return map;
  }, [enabledChainIdentifiers]);

  // 기본적으로 최초로 활성화되어있던 체인의 경우 sort에서 우선권을 가진다.
  const [sortPriorityChainIdentifierMap] = useState(enabledChainIdentifierMap);

  // 검색 뿐만 아니라 로직에 따른 선택할 수 있는 체인 목록을 가지고 있다.
  // 그러니까 로직을 파악해서 주의해서 사용해야함.
  // 그리고 이를 토대로 balance에 따른 sort를 진행한다.
  // queries store의 구조 문제로 useMemo 안에서 balance에 따른 sort를 진행하긴 힘들다.
  // 그래서 이를 위한 변수로 따로 둔다.
  // 실제로는 chainInfos를 사용하면 된다.
  const preSortChainInfos = useMemo(() => {
    let chainInfos = chainStore.chainInfos.slice();

    if (keyType === 'ledger') {
      chainInfos = chainInfos.filter(chainInfo => {
        const isEthermintLike =
          chainInfo.bip44.coinType === 60 ||
          !!chainInfo.features?.includes('eth-address-gen') ||
          !!chainInfo.features?.includes('eth-key-sign');

        // Ledger일 경우 ethereum app을 바로 처리할 수 없다.
        // 이 경우 빼줘야한다.
        if (isEthermintLike && !fallbackEthereumLedgerApp) {
          return false;
        }

        // fallbackEthereumLedgerApp가 true이면 ethereum app이 필요없는 체인은 이전에 다 처리된 것이다.
        // 이게 true이면 ethereum app이 필요하고 가능한 체인만 남기면 된다.
        if (fallbackEthereumLedgerApp) {
          if (!isEthermintLike) {
            return false;
          }

          try {
            // 처리가능한 체인만 true를 반환한다.
            KeyRingCosmosService.throwErrorIfEthermintWithLedgerButNotSupported(
              chainInfo.chainId,
            );
            return true;
          } catch {
            return false;
          }
        }

        return true;
      });
    }

    const trimSearch = search.trim();

    if (!trimSearch) {
      return chainInfos;
    } else {
      return chainInfos.filter(chainInfo => {
        return (
          chainInfo.chainName
            .toLowerCase()
            .includes(trimSearch.toLowerCase()) ||
          (chainInfo.stakeCurrency || chainInfo.currencies[0]).coinDenom
            .toLowerCase()
            .includes(trimSearch.toLowerCase())
        );
      });
    }
  }, [chainStore.chainInfos, fallbackEthereumLedgerApp, keyType, search]);

  const chainInfos = preSortChainInfos.sort((a, b) => {
    const aHasPriority = sortPriorityChainIdentifierMap.has(a.chainIdentifier);
    const bHasPriority = sortPriorityChainIdentifierMap.has(b.chainIdentifier);

    if (aHasPriority && !bHasPriority) {
      return -1;
    }

    if (!aHasPriority && bHasPriority) {
      return 1;
    }

    const aBalance = (() => {
      const addresses = candidateAddressesMap.get(a.chainIdentifier);
      const chainInfo = chainStore.getChain(a.chainId);
      if (addresses && addresses.length > 0) {
        const queryBal = queriesStore
          .get(a.chainId)
          .queryBalances.getQueryBech32Address(addresses[0].address)
          .getBalance(chainInfo.stakeCurrency || chainInfo.currencies[0]);
        if (queryBal) {
          return queryBal.balance;
        }
      }

      return new CoinPretty(
        chainInfo.stakeCurrency || chainInfo.currencies[0],
        '0',
      );
    })();
    const bBalance = (() => {
      const addresses = candidateAddressesMap.get(b.chainIdentifier);
      const chainInfo = chainStore.getChain(b.chainId);
      if (addresses && addresses.length > 0) {
        const queryBal = queriesStore
          .get(b.chainId)
          .queryBalances.getQueryBech32Address(addresses[0].address)
          .getBalance(chainInfo.stakeCurrency || chainInfo.currencies[0]);
        if (queryBal) {
          return queryBal.balance;
        }
      }

      return new CoinPretty(
        chainInfo.stakeCurrency || chainInfo.currencies[0],
        '0',
      );
    })();

    const aPrice = priceStore.calculatePrice(aBalance)?.toDec() ?? new Dec(0);
    const bPrice = priceStore.calculatePrice(bBalance)?.toDec() ?? new Dec(0);

    if (!aPrice.equals(bPrice)) {
      return aPrice.gt(bPrice) ? -1 : 1;
    }

    // balance의 fiat 기준으로 sort.
    // 같으면 이름 기준으로 sort.
    return a.chainName.localeCompare(b.chainName);
  });

  const numSelected = useMemo(() => {
    const chainInfoMap = new Map<string, ChainInfo>();
    for (const chanInfo of chainStore.chainInfos) {
      chainInfoMap.set(chanInfo.chainIdentifier, chanInfo);
    }

    let numSelected = 0;
    for (const enabledChainIdentifier of enabledChainIdentifiers) {
      if (chainInfoMap.has(enabledChainIdentifier)) {
        numSelected++;
      }
    }
    return numSelected;
  }, [chainStore.chainInfos, enabledChainIdentifiers]);

  // Todo: Ledger 등록 후 제작
  // const enabledChainIdentifiersInPage = useMemo(() => {
  //   return enabledChainIdentifiers.filter(chainIdentifier =>
  //     chainInfos.some(
  //       chainInfo => chainIdentifier === chainInfo.chainIdentifier,
  //     ),
  //   );
  // }, [enabledChainIdentifiers, chainInfos]);
  //
  // const [preSelectedChainIdentifiers, setPreSelectedChainIdentifiers] =
  //   useState<string[]>([]);

  const replaceToWelcomePage = () => {
    if (skipWelcome) {
      navigation.reset({routes: [{name: 'Home'}]});
    } else {
      navigation.reset({
        routes: [{name: 'Register.Welcome', params: {password}}],
      });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{flex: 1}}>
      <RegisterHeader
        title={intl.formatMessage({
          id: 'pages.register.enable-chains.title',
        })}
        paragraph={
          isFresh ? `Step ${(stepPrevious ?? 0) + 1}/${stepTotal}` : undefined
        }
        hideBackButton={true}
      />

      <Box padding={20} alignX="center" style={{flex: 1}}>
        <Text
          style={StyleSheet.flatten([
            style.flatten(['color-text-low', 'body1']),
            {textAlign: 'center'},
          ])}>
          <FormattedMessage id="pages.register.enable-chains.paragraph" />
        </Text>

        <Gutter size={16} />

        <TextInput
          left={color => <SearchIcon size={20} color={color} />}
          value={search}
          onChangeText={text => {
            setSearch(text);
          }}
          placeholder={intl.formatMessage({
            id: 'pages.register.enable-chains.search-input-placeholder',
          })}
          containerStyle={{width: '100%'}}
        />

        <Gutter size={16} />

        <Text style={style.flatten(['subtitle3', 'color-text-high'])}>
          <FormattedMessage
            id="pages.register.enable-chains.chain-selected-count"
            values={{numSelected}}
          />
        </Text>

        <Gutter size={16} />

        <Box
          width="100%"
          borderRadius={6}
          style={{flex: 1, overflow: 'hidden'}}>
          <FlatList
            data={chainInfos}
            keyExtractor={item => item.chainId}
            renderItem={({item: chainInfo}) => {
              const account = accountStore.getAccount(chainInfo.chainId);

              const queries = queriesStore.get(chainInfo.chainId);

              const balance = (() => {
                const currency =
                  chainInfo.stakeCurrency || chainInfo.currencies[0];
                const queryBal = queries.queryBalances
                  .getQueryBech32Address(account.bech32Address)
                  .getBalance(currency);
                if (queryBal) {
                  return queryBal.balance;
                }
                return new CoinPretty(currency, '0');
              })();

              const enabled =
                enabledChainIdentifierMap.get(chainInfo.chainIdentifier) ||
                false;

              // At least, one chain should be enabled.
              const blockInteraction =
                enabledChainIdentifiers.length <= 1 && enabled;

              return (
                <ChainItem
                  chainInfo={chainInfo}
                  balance={balance}
                  enabled={enabled}
                  blockInteraction={blockInteraction}
                  isFresh={isFresh || account.bech32Address === ''}
                  onClick={() => {
                    if (
                      enabledChainIdentifierMap.get(chainInfo.chainIdentifier)
                    ) {
                      setEnabledChainIdentifiers(
                        enabledChainIdentifiers.filter(
                          chainIdentifier =>
                            chainIdentifier !== chainInfo.chainIdentifier,
                        ),
                      );
                    } else {
                      setEnabledChainIdentifiers([
                        ...enabledChainIdentifiers,
                        chainInfo.chainIdentifier,
                      ]);
                    }
                  }}
                />
              );
            }}
            ItemSeparatorComponent={Divider}
          />
        </Box>

        <Gutter size={16} />

        <Button
          text={intl.formatMessage({
            id: 'button.save',
          })}
          size="large"
          containerStyle={{width: '100%'}}
          onPress={async () => {
            const enables: string[] = [];
            const disables: string[] = [];

            for (const chainInfo of chainStore.chainInfos) {
              const enabled =
                enabledChainIdentifierMap.get(chainInfo.chainIdentifier) ||
                false;

              if (enabled) {
                enables.push(chainInfo.chainIdentifier);
              } else {
                disables.push(chainInfo.chainIdentifier);
              }
            }

            const needFinalizeCoinType: string[] = [];
            for (let i = 0; i < enables.length; i++) {
              const enable = enables[i];
              const chainInfo = chainStore.getChain(enable);
              if (keyRingStore.needKeyCoinTypeFinalize(vaultId, chainInfo)) {
                // Remove enable from enables
                enables.splice(i, 1);
                i--;
                // And push it disables
                disables.push(enable);

                needFinalizeCoinType.push(enable);
              }
            }

            const ledgerEthereumAppNeeds: string[] = [];
            for (let i = 0; i < enables.length; i++) {
              if (!fallbackEthereumLedgerApp) {
                break;
              }

              const enable = enables[i];

              const chainInfo = chainStore.getChain(enable);
              const isEthermintLike =
                chainInfo.bip44.coinType === 60 ||
                !!chainInfo.features?.includes('eth-address-gen') ||
                !!chainInfo.features?.includes('eth-key-sign');

              if (isEthermintLike) {
                // 참고로 위에서 chainInfos memo로 인해서 막혀있기 때문에
                // 여기서 throwErrorIfEthermintWithLedgerButNotSupported 확인은 생략한다.
                // Remove enable from enables
                enables.splice(i, 1);
                i--;
                // And push it disables
                disables.push(enable);

                ledgerEthereumAppNeeds.push(enable);
              }
            }

            await Promise.all([
              (async () => {
                if (enables.length > 0) {
                  await chainStore.enableChainInfoInUIWithVaultId(
                    vaultId,
                    ...enables,
                  );
                }
              })(),
              (async () => {
                if (disables.length > 0) {
                  await chainStore.disableChainInfoInUIWithVaultId(
                    vaultId,
                    ...disables,
                  );
                }
              })(),
            ]);

            if (needFinalizeCoinType.length > 0) {
              sceneMovedToSelectDerivation.current = true;
              navigation.reset({
                routes: [
                  {
                    name: 'Register.SelectDerivationPath',
                    params: {
                      vaultId,
                      chainIds: needFinalizeCoinType,
                      totalCount: needFinalizeCoinType.length,
                      password,
                      skipWelcome,
                    },
                  },
                ],
              });
            } else {
              // 어차피 bip44 coin type selection과 ethereum ledger app이 동시에 필요한 경우는 없다.
              // (ledger에서는 coin type이 app당 할당되기 때문에...)
              if (keyType === 'ledger') {
                // Todo: Ledger 로직 추가
              } else {
                replaceToWelcomePage();
              }
            }
          }}
        />
      </Box>
    </KeyboardAvoidingView>
  );
});

const ChainItem: FunctionComponent<{
  chainInfo: ChainInfo;
  balance: CoinPretty;

  enabled: boolean;
  blockInteraction: boolean;

  onClick: () => void;

  isFresh: boolean;
}> = observer(
  ({chainInfo, balance, enabled, blockInteraction, onClick, isFresh}) => {
    const style = useStyle();
    const {priceStore} = useStore();
    const price = priceStore.calculatePrice(balance);

    const toggle = () => {
      if (!blockInteraction) {
        onClick();
      }
    };

    return (
      <Box
        paddingX={16}
        paddingY={14}
        backgroundColor={
          enabled
            ? style.get('color-gray-550').color
            : style.get('color-gray-600').color
        }
        onClick={toggle}>
        <XAxis alignY="center">
          <FastImage
            style={style.flatten(['width-40', 'height-40', 'border-radius-40'])}
            source={
              chainInfo.chainSymbolImageUrl
                ? {uri: chainInfo.chainSymbolImageUrl}
                : require('../../../public/assets/img/chain-icon-alt.png')
            }
            resizeMode={FastImage.resizeMode.contain}
          />

          <Gutter size={8} />

          <Text style={style.flatten(['subtitle2', 'color-white', 'flex-1'])}>
            {chainInfo.chainName}
          </Text>
          {isFresh ? null : (
            <YAxis alignX="right">
              <Text style={style.flatten(['subtitle3', 'color-gray-10'])}>
                {balance
                  .maxDecimals(6)
                  .shrink(true)
                  .inequalitySymbol(true)
                  .toString()}
              </Text>

              <Gutter size={4} />

              <Text style={style.flatten(['subtitle3', 'color-gray-300'])}>
                {price ? price.toString() : '-'}
              </Text>
            </YAxis>
          )}

          <Gutter size={16} />

          <Checkbox checked={enabled} onPress={toggle} size="large" />
        </XAxis>
      </Box>
    );
  },
);

const Divider = () => {
  const style = useStyle();

  return <Box height={1} backgroundColor={style.get('color-gray-500').color} />;
};
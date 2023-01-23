/* eslint-disable max-lines */
import Client from "@walletconnect/sign-client";
import {getSdkError, getAppMetadata} from "@walletconnect/utils";
import {SessionTypes} from "@walletconnect/types";
// import {formatJsonRpcRequest} from "@json-rpc-tools/utils/dist/cjs/format";

import PeraWalletConnectError from "./util/PeraWalletConnectError";
import {
  openPeraWalletConnectModal,
  openPeraWalletRedirectModal,
  removeModalWrapperFromDOM,
  PERA_WALLET_CONNECT_MODAL_ID,
  PERA_WALLET_REDIRECT_MODAL_ID,
  openPeraWalletSignTxnToast,
  PERA_WALLET_SIGN_TXN_TOAST_ID,
  openPeraWalletSignTxnModal,
  closePeraWalletSignTxnModal,
  PERA_WALLET_IFRAME_ID,
  PERA_WALLET_MODAL_CLASSNAME,
  PERA_WALLET_SIGN_TXN_MODAL_ID,
  renderQRCode
} from "./modal/peraWalletConnectModalUtils";
import {
  getWalletDetailsFromStorage,
  getLocalStorage,
  resetWalletDetailsFromStorage,
  saveWalletDetailsToStorage,
  getNetworkFromStorage,
  getWalletPlatformFromStorage
} from "./util/storage/storageUtils";
import {getPeraConnectConfig} from "./util/api/peraWalletConnectApi";
import {PERA_WALLET_LOCAL_STORAGE_KEYS} from "./util/storage/storageConstants";
import {PeraWalletTransaction, SignerTransaction} from "./util/model/peraWalletModels";
import {
  base64ToUint8Array,
  encodeUnsignedTransactionInBase64
} from "./util/transaction/transactionUtils";
import {detectBrowser, isMobile} from "./util/device/deviceUtils";
import {AlgorandChainIDs, AppMeta, PeraWalletNetwork} from "./util/peraWalletTypes";
import {generateEmbeddedWalletURL, getPeraWalletAppMeta} from "./util/peraWalletUtils";
import appTellerManager, {PeraTeller} from "./util/network/teller/appTellerManager";
import {getPeraWebWalletURL} from "./util/peraWalletConstants";
import {getMetaInfo, waitForTabOpening} from "./util/dom/domUtils";

interface PeraWalletConnectOptions {
  projectId: string;
  deep_link?: string;
  app_meta?: AppMeta;
  shouldShowSignTxnToast?: boolean;
  network?: PeraWalletNetwork;
  chainId?: AlgorandChainIDs;
}

class PeraWalletConnect {
  client: Client | null;
  projectId: string;
  shouldShowSignTxnToast: boolean;
  network = getNetworkFromStorage();
  session: SessionTypes.Struct | null;
  chainId?: number;

  constructor(options: PeraWalletConnectOptions) {
    if (options?.deep_link) {
      getLocalStorage()?.setItem(
        PERA_WALLET_LOCAL_STORAGE_KEYS.DEEP_LINK,
        options.deep_link
      );
    }

    if (options?.app_meta) {
      getLocalStorage()?.setItem(
        PERA_WALLET_LOCAL_STORAGE_KEYS.APP_META,
        JSON.stringify(options.app_meta)
      );
    }

    if (options?.network) {
      this.network = options.network;
    }

    getLocalStorage()?.setItem(
      PERA_WALLET_LOCAL_STORAGE_KEYS.NETWORK,
      options?.network || "mainnet"
    );

    this.projectId = options.projectId;

    this.shouldShowSignTxnToast =
      typeof options?.shouldShowSignTxnToast === "undefined"
        ? true
        : options.shouldShowSignTxnToast;

    this.chainId = options?.chainId;

    window.addEventListener("DOMContentLoaded", async () => {
      this.client = await this.createClient();
    });
  }

  get platform() {
    return getWalletPlatformFromStorage();
  }

  get isConnected() {
    if (this.platform === "mobile" || this.platform === "web") {
      return !!getWalletDetailsFromStorage()?.accounts.length;
    }

    return false;
  }

  get accounts() {
    return getWalletDetailsFromStorage()?.accounts;
  }

  private connectWithWebWallet(
    resolve: (accounts: string[]) => void,
    reject: (reason?: any) => void,
    webWalletURL: string,
    chainId: number | undefined
  ) {
    const browser = detectBrowser();
    const webWalletURLs = getPeraWebWalletURL(webWalletURL, this.network);

    const peraWalletIframe = document.createElement("iframe");

    function onReceiveMessage(event: MessageEvent<TellerMessage<PeraTeller>>) {
      if (resolve && event.data.message.type === "CONNECT_CALLBACK") {
        const accounts = event.data.message.data.addresses;

        saveWalletDetailsToStorage(accounts, "pera-wallet-web");

        resolve(accounts);

        onClose();

        document.getElementById(PERA_WALLET_IFRAME_ID)?.remove();
      } else if (event.data.message.type === "CONNECT_NETWORK_MISMATCH") {
        reject(
          new PeraWalletConnectError(
            {
              type: "CONNECT_NETWORK_MISMATCH",
              detail: event.data.message.error
            },
            event.data.message.error ||
              `Your wallet is connected to a different network to this dApp. Update your wallet to the correct network (MainNet or TestNet) to continue.`
          )
        );

        onClose();

        document.getElementById(PERA_WALLET_IFRAME_ID)?.remove();
      } else if (
        ["CREATE_PASSCODE_EMBEDDED", "SELECT_ACCOUNT_EMBEDDED"].includes(
          event.data.message.type
        )
      ) {
        if (event.data.message.type === "CREATE_PASSCODE_EMBEDDED") {
          const newPeraWalletTab = window.open(webWalletURLs.CONNECT, "_blank");

          if (newPeraWalletTab && newPeraWalletTab.opener) {
            appTellerManager.sendMessage({
              message: {
                type: "CONNECT",
                data: {
                  ...getMetaInfo(),
                  chainId
                }
              },

              origin: webWalletURLs.CONNECT,
              targetWindow: newPeraWalletTab
            });
          }

          const checkTabIsAliveInterval = setInterval(() => {
            if (newPeraWalletTab?.closed === true) {
              reject(
                new PeraWalletConnectError(
                  {
                    type: "CONNECT_CANCELLED"
                  },
                  "Connect is cancelled by user"
                )
              );

              onClose();
              clearInterval(checkTabIsAliveInterval);
            }

            // eslint-disable-next-line no-magic-numbers
          }, 2000);

          appTellerManager.setupListener({
            onReceiveMessage: (newTabEvent: MessageEvent<TellerMessage<PeraTeller>>) => {
              if (resolve && newTabEvent.data.message.type === "CONNECT_CALLBACK") {
                const accounts = newTabEvent.data.message.data.addresses;

                saveWalletDetailsToStorage(accounts, "pera-wallet-web");

                resolve(accounts);

                onClose();

                newPeraWalletTab?.close();
              }
            }
          });
        } else if (event.data.message.type === "SELECT_ACCOUNT_EMBEDDED") {
          const peraWalletConnectModalWrapper = document.getElementById(
            PERA_WALLET_CONNECT_MODAL_ID
          );

          const peraWalletConnectModal = peraWalletConnectModalWrapper
            ?.querySelector("pera-wallet-connect-modal")
            ?.shadowRoot?.querySelector(`.${PERA_WALLET_MODAL_CLASSNAME}`);

          const peraWalletConnectModalDesktopMode = peraWalletConnectModal
            ?.querySelector("pera-wallet-modal-desktop-mode")
            ?.shadowRoot?.querySelector(".pera-wallet-connect-modal-desktop-mode");

          if (peraWalletConnectModal && peraWalletConnectModalDesktopMode) {
            peraWalletConnectModal.classList.add(
              `${PERA_WALLET_MODAL_CLASSNAME}--select-account`
            );
            peraWalletConnectModal.classList.remove(
              `${PERA_WALLET_MODAL_CLASSNAME}--create-passcode`
            );
            peraWalletConnectModalDesktopMode.classList.add(
              `pera-wallet-connect-modal-desktop-mode--select-account`
            );
            peraWalletConnectModalDesktopMode.classList.remove(
              `pera-wallet-connect-modal-desktop-mode--create-passcode`
            );
          }

          appTellerManager.sendMessage({
            message: {
              type: "SELECT_ACCOUNT_EMBEDDED_CALLBACK"
            },
            origin: webWalletURLs.CONNECT,
            targetWindow: peraWalletIframe.contentWindow!
          });
        }
      }
    }

    function onWebWalletConnect(peraWalletIframeWrapper: Element) {
      if (browser === "Chrome") {
        peraWalletIframe.setAttribute("id", PERA_WALLET_IFRAME_ID);
        peraWalletIframe.setAttribute(
          "src",
          generateEmbeddedWalletURL(webWalletURLs.CONNECT)
        );

        peraWalletIframeWrapper.appendChild(peraWalletIframe);

        if (peraWalletIframe.contentWindow) {
          appTellerManager.sendMessage({
            message: {
              type: "CONNECT",
              data: {
                ...getMetaInfo(),
                chainId
              }
            },

            origin: webWalletURLs.CONNECT,
            targetWindow: peraWalletIframe.contentWindow,
            timeout: 5000
          });
        }

        appTellerManager.setupListener({
          onReceiveMessage
        });
      } else {
        waitForTabOpening(webWalletURLs.CONNECT).then((newPeraWalletTab) => {
          if (newPeraWalletTab && newPeraWalletTab.opener) {
            appTellerManager.sendMessage({
              message: {
                type: "CONNECT",
                data: {
                  ...getMetaInfo(),
                  chainId
                }
              },

              origin: webWalletURLs.CONNECT,
              targetWindow: newPeraWalletTab,
              timeout: 5000
            });
          }

          const checkTabIsAliveInterval = setInterval(() => {
            if (newPeraWalletTab?.closed === true) {
              reject(
                new PeraWalletConnectError(
                  {
                    type: "CONNECT_CANCELLED"
                  },
                  "Connect is cancelled by user"
                )
              );

              clearInterval(checkTabIsAliveInterval);
              onClose();
            }

            // eslint-disable-next-line no-magic-numbers
          }, 2000);

          appTellerManager.setupListener({
            onReceiveMessage: (event: MessageEvent<TellerMessage<PeraTeller>>) => {
              if (resolve && event.data.message.type === "CONNECT_CALLBACK") {
                const accounts = event.data.message.data.addresses;

                saveWalletDetailsToStorage(accounts, "pera-wallet-web");

                resolve(accounts);

                onClose();

                newPeraWalletTab?.close();
              } else if (event.data.message.type === "CONNECT_NETWORK_MISMATCH") {
                reject(
                  new PeraWalletConnectError(
                    {
                      type: "CONNECT_NETWORK_MISMATCH",
                      detail: event.data.message.error
                    },
                    event.data.message.error ||
                      `Your wallet is connected to a different network to this dApp. Update your wallet to the correct network (MainNet or TestNet) to continue.`
                  )
                );

                onClose();

                newPeraWalletTab?.close();
              }
            }
          });
        });
      }
    }

    function onClose() {
      removeModalWrapperFromDOM(PERA_WALLET_CONNECT_MODAL_ID);
    }

    return {
      onWebWalletConnect
    };
  }

  connect({network}: {network?: PeraWalletNetwork} = {}) {
    return new Promise<string[]>(async (resolve, reject) => {
      try {
        if (this.client?.session) {
          this.disconnect();
        }

        if (network) {
          // override network if provided
          getLocalStorage()?.setItem(PERA_WALLET_LOCAL_STORAGE_KEYS.NETWORK, network);
        }

        const {
          isWebWalletAvailable,
          webWalletURL,
          shouldDisplayNewBadge,
          shouldUseSound
        } = await getPeraConnectConfig(network || this.network);

        const {onWebWalletConnect} = this.connectWithWebWallet(
          resolve,
          reject,
          webWalletURL,
          this.chainId
        );

        if (isWebWalletAvailable) {
          // @ts-ignore ts-2339
          window.onWebWalletConnect = onWebWalletConnect;
        }

        openPeraWalletConnectModal({
          isWebWalletAvailable,
          shouldDisplayNewBadge,
          shouldUseSound
        });

        if (!this.client) {
          this.client = await this.createClient();
        }

        const {uri, approval} = await this.client.connect({
          requiredNamespaces: {
            // TODO: We should update this after align with mobile team
            algorand: {
              methods: ["algo_signTxn"],
              chains: ["algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe"],
              events: []
            }
          }
        });

        if (uri) {
          renderQRCode(uri, isWebWalletAvailable);

          const peraWalletConnectModalWrapper = document.getElementById(
            PERA_WALLET_CONNECT_MODAL_ID
          );

          const peraWalletConnectModal = peraWalletConnectModalWrapper
            ?.querySelector("pera-wallet-connect-modal")
            ?.shadowRoot?.querySelector(`.${PERA_WALLET_MODAL_CLASSNAME}`);

          const closeButton = peraWalletConnectModal
            ?.querySelector("pera-wallet-modal-header")
            ?.shadowRoot?.getElementById("pera-wallet-modal-header-close-button");

          closeButton?.addEventListener("click", () => {
            reject(
              new PeraWalletConnectError(
                {
                  type: "CONNECT_MODAL_CLOSED"
                },
                "Connect modal is closed by user"
              )
            );

            removeModalWrapperFromDOM(PERA_WALLET_CONNECT_MODAL_ID);
          });
        }

        this.session = await approval();

        const {namespaces} = this.session;

        const accounts = Object.values(namespaces)
          .map((namespace) => namespace.accounts)
          .flat();

        saveWalletDetailsToStorage(accounts || []);

        resolve(accounts);
      } catch (error: any) {
        console.log(error);

        const {name} = getPeraWalletAppMeta();

        reject(
          new PeraWalletConnectError(
            {
              type: "SESSION_CONNECT",
              detail: error
            },
            error.message || `There was an error while connecting to ${name}`
          )
        );
      } finally {
        removeModalWrapperFromDOM(PERA_WALLET_CONNECT_MODAL_ID);
      }
    });
  }

  reconnectSession() {
    return new Promise<string[]>(async (resolve, reject) => {
      try {
        const walletDetails = getWalletDetailsFromStorage();

        if (walletDetails?.type === "pera-wallet-web") {
          const {isWebWalletAvailable} = await getPeraConnectConfig(this.network);

          if (!isWebWalletAvailable) {
            reject(
              new PeraWalletConnectError(
                {
                  type: "SESSION_RECONNECT",
                  detail: "Pera Web is not available"
                },
                "Pera Web is not available"
              )
            );
          }
        }

        if (this.isConnected) {
          resolve(walletDetails!.accounts);
        }
        // If there is no wallet details in storage, resolve the promise with empty array
        else {
          resolve([]);
        }
      } catch (error: any) {
        // If the bridge is not active, then disconnect
        await this.disconnect();

        const {name} = getPeraWalletAppMeta();

        reject(
          new PeraWalletConnectError(
            {
              type: "SESSION_RECONNECT",
              detail: error
            },
            error.message || `There was an error while reconnecting to ${name}`
          )
        );
      }
    });
  }

  private async createClient() {
    try {
      const client = await Client.init({
        relayUrl: "wss://relay.walletconnect.com",
        projectId: this.projectId,
        metadata: getAppMetadata()
      });

      this.client = client;

      this.checkPersistedState(client);

      return client;
    } catch (err) {
      throw err;
    }
  }

  private checkPersistedState(client: Client) {
    if (typeof this.session !== "undefined") return;
    // populates (the last) existing session to state

    if (client.session.length) {
      const lastKeyIndex = client!.session.keys.length - 1;

      const session = client.session.get(client.session.keys[lastKeyIndex]);

      this.session = session;

      const {namespaces: updatedNamespaces} = this.session;

      console.log("RESTORED SESSION:", session);

      const accounts = Object.values(updatedNamespaces)
        .map((namespace) => namespace.accounts)
        .flat();

      saveWalletDetailsToStorage(accounts || []);
    }
  }

  disconnect() {
    return new Promise(async (resolve, reject) => {
      if (this.isConnected && this.platform === "mobile") {
        if (typeof this.client === "undefined") {
          reject(new Error("WalletConnect is not initialized"));
        }

        if (typeof this.client?.session === "undefined") {
          reject(new Error("WalletConnect is not initialized"));
        }

        try {
          if (this.session && this.client) {
            await this.client.disconnect({
              topic: this.session.topic,
              reason: getSdkError("USER_DISCONNECTED")
            });

            this.client = null;
            this.session = null;
            resolve(null);
          }
        } catch (error) {
          reject(error);
        }
      }

      await resetWalletDetailsFromStorage();
      resolve(null);
    });
  }

  private async signTransactionWithMobile(signTxnRequestParams: PeraWalletTransaction[]) {
    // const formattedSignTxnRequest = formatJsonRpcRequest("algo_signTxn", [
    //   signTxnRequestParams
    // ]);

    try {
      try {
        // const {silent} = await getPeraConnectConfig(this.network);

        const response = await this.client!.request({
          topic: this.session!.topic,
          // TODO: We should update this after align with mobile team
          request: {
            method: "algo_signTxn",
            params: signTxnRequestParams
          },
          chainId: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe"
        });

        // We send the full txn group to the mobile wallet.
        // Therefore, we first filter out txns that were not signed by the wallet.
        // These are received as `null`.
        // @ts-ignore
        const nonNullResponse = response.filter(Boolean) as (string | number[])[];

        return typeof nonNullResponse[0] === "string"
          ? (nonNullResponse as string[]).map(base64ToUint8Array)
          : (nonNullResponse as number[][]).map((item) => Uint8Array.from(item));
      } catch (error) {
        return await Promise.reject(
          new PeraWalletConnectError(
            {
              type: "SIGN_TRANSACTIONS",
              detail: error
            },
            error.message || "Failed to sign transaction"
          )
        );
      }
    } finally {
      removeModalWrapperFromDOM(PERA_WALLET_REDIRECT_MODAL_ID);
      removeModalWrapperFromDOM(PERA_WALLET_SIGN_TXN_TOAST_ID);
    }
  }

  private signTransactionWithWeb(
    signTxnRequestParams: PeraWalletTransaction[],
    webWalletURL: string
  ) {
    return new Promise<Uint8Array[]>((resolve, reject) => {
      const webWalletURLs = getPeraWebWalletURL(webWalletURL, this.network);
      const browser = detectBrowser();
      let newPeraWalletTab: Window | null;

      const checkTabIsAliveInterval = setInterval(() => {
        if (newPeraWalletTab?.closed === true) {
          reject(
            new PeraWalletConnectError(
              {
                type: "SIGN_TXN_CANCELLED"
              },
              "Transaction signing is cancelled by user."
            )
          );

          clearInterval(checkTabIsAliveInterval);
        }

        // eslint-disable-next-line no-magic-numbers
      }, 2000);

      if (browser === "Chrome") {
        openPeraWalletSignTxnModal()
          .then((modal) => {
            const peraWalletSignTxnModalIFrameWrapper = modal;

            const peraWalletIframe = document.createElement("iframe");

            peraWalletIframe.setAttribute("id", PERA_WALLET_IFRAME_ID);
            peraWalletIframe.setAttribute(
              "src",
              generateEmbeddedWalletURL(webWalletURLs.TRANSACTION_SIGN)
            );

            peraWalletSignTxnModalIFrameWrapper?.appendChild(peraWalletIframe);

            const peraWalletSignTxnModalHeader = document
              .getElementById(PERA_WALLET_SIGN_TXN_MODAL_ID)
              ?.querySelector("pera-wallet-sign-txn-modal")
              ?.shadowRoot?.querySelector(`pera-wallet-modal-header`);

            const peraWalletSignTxnModalCloseButton =
              peraWalletSignTxnModalHeader?.shadowRoot?.getElementById(
                "pera-wallet-modal-header-close-button"
              );

            if (peraWalletSignTxnModalCloseButton) {
              peraWalletSignTxnModalCloseButton.addEventListener("click", () => {
                reject(
                  new PeraWalletConnectError(
                    {
                      type: "SIGN_TXN_CANCELLED"
                    },
                    "Transaction signing is cancelled by user."
                  )
                );

                removeModalWrapperFromDOM(PERA_WALLET_SIGN_TXN_MODAL_ID);
              });
            }

            if (peraWalletIframe.contentWindow) {
              appTellerManager.sendMessage({
                message: {
                  type: "SIGN_TXN",
                  txn: signTxnRequestParams
                },

                origin: generateEmbeddedWalletURL(webWalletURLs.TRANSACTION_SIGN),
                targetWindow: peraWalletIframe.contentWindow,
                timeout: 3000
              });
            }

            // Returns a promise that waits for the response from the web wallet.
            // The promise is resolved when the web wallet responds with the signed txn.
            // The promise is rejected when the web wallet responds with an error.
          })
          .catch((error) => {
            console.log(error);
          });
      } else {
        waitForTabOpening(webWalletURLs.TRANSACTION_SIGN)
          .then((newTab) => {
            newPeraWalletTab = newTab;

            if (newPeraWalletTab && newPeraWalletTab.opener) {
              appTellerManager.sendMessage({
                message: {
                  type: "SIGN_TXN",
                  txn: signTxnRequestParams
                },

                origin: webWalletURLs.TRANSACTION_SIGN,
                targetWindow: newPeraWalletTab,
                timeout: 3000
              });
            }
          })
          .catch((error) => {
            console.log(error);
          });
      }

      appTellerManager.setupListener({
        onReceiveMessage: (event: MessageEvent<TellerMessage<PeraTeller>>) => {
          if (event.data.message.type === "SIGN_TXN_CALLBACK") {
            if (browser === "Chrome") {
              document.getElementById(PERA_WALLET_IFRAME_ID)?.remove();
              closePeraWalletSignTxnModal();
            }

            newPeraWalletTab?.close();

            resolve(
              event.data.message.signedTxns.map((txn) =>
                base64ToUint8Array(txn.signedTxn)
              )
            );
          }

          if (event.data.message.type === "SIGN_TXN_NETWORK_MISMATCH") {
            reject(
              new PeraWalletConnectError(
                {
                  type: "SIGN_TXN_NETWORK_MISMATCH",
                  detail: event.data.message.error
                },
                event.data.message.error || "Network mismatch"
              )
            );
          }

          if (event.data.message.type === "SESSION_DISCONNECTED") {
            if (browser === "Chrome") {
              document.getElementById(PERA_WALLET_IFRAME_ID)?.remove();
              closePeraWalletSignTxnModal();
            }

            newPeraWalletTab?.close();

            resetWalletDetailsFromStorage();

            reject(
              new PeraWalletConnectError(
                {
                  type: "SESSION_DISCONNECTED",
                  detail: event.data.message.error
                },
                event.data.message.error
              )
            );
          }

          if (event.data.message.type === "SIGN_TXN_CALLBACK_ERROR") {
            if (browser === "Chrome") {
              document.getElementById(PERA_WALLET_IFRAME_ID)?.remove();
              closePeraWalletSignTxnModal();
            }

            newPeraWalletTab?.close();

            reject(
              new PeraWalletConnectError(
                {
                  type: "SIGN_TXN_CANCELLED"
                },
                event.data.message.error
              )
            );
          }
        }
      });
    });
  }

  async signTransaction(
    txGroups: SignerTransaction[][],
    signerAddress?: string
  ): Promise<Uint8Array[]> {
    const walletDetails = getWalletDetailsFromStorage();

    if (walletDetails?.type === "pera-wallet") {
      if (isMobile()) {
        // This is to automatically open the wallet app when trying to sign with it.
        openPeraWalletRedirectModal();
      } else if (!isMobile() && this.shouldShowSignTxnToast) {
        // This is to inform user go the wallet app when trying to sign with it.
        openPeraWalletSignTxnToast();
      }

      if (!this.client) {
        throw new Error("PeraWalletConnect was not initialized correctly.");
      }
    }

    // Prepare transactions to be sent to wallet
    const signTxnRequestParams = txGroups.flatMap((txGroup) =>
      txGroup.map<PeraWalletTransaction>((txGroupDetail) => {
        let signers: PeraWalletTransaction["signers"];

        if (signerAddress && !(txGroupDetail.signers || []).includes(signerAddress)) {
          signers = [];
        }

        const txnRequestParams: PeraWalletTransaction = {
          txn: encodeUnsignedTransactionInBase64(txGroupDetail.txn)
        };

        if (Array.isArray(signers)) {
          txnRequestParams.signers = signers;
        }

        if (txGroupDetail.authAddr) {
          txnRequestParams.authAddr = txGroupDetail.authAddr;
        }

        if (txGroupDetail.message) {
          txnRequestParams.message = txGroupDetail.message;
        }

        if (txGroupDetail.msig) {
          txnRequestParams.msig = txGroupDetail.msig;
        }

        return txnRequestParams;
      })
    );

    // ================================================= //
    // Pera Wallet Web flow
    if (walletDetails?.type === "pera-wallet-web") {
      const {webWalletURL} = await getPeraConnectConfig(this.network);

      return this.signTransactionWithWeb(signTxnRequestParams, webWalletURL);
    }
    // ================================================= //
    // ================================================= //
    // Pera Mobile Wallet flow
    return this.signTransactionWithMobile(signTxnRequestParams);
    // ================================================= //
  }
}

export default PeraWalletConnect;
/* eslint-enable max-lines */

import PeraWalletLogoWithBlackBackground from "../asset/icon/PeraWalletWithBlackBackground.svg";

import QRCodeStyling from "qr-code-styling";

import PeraWalletConnectError from "../util/PeraWalletConnectError";
import {waitForElementCreatedAtShadowDOM} from "../util/dom/domUtils";

export type PERA_CONNECT_MODAL_VIEWS = "default" | "download-pera";

export interface PeraWalletModalConfig {
  uri: string;
  isWebWalletAvailable: boolean;
  shouldDisplayNewBadge: boolean;
  shouldUseSound: boolean;
}

// The ID of the wrapper element for PeraWalletConnectModal
const PERA_WALLET_CONNECT_MODAL_ID = "pera-wallet-connect-modal-wrapper";

// The ID of the wrapper element for PeraWalletRedirectModal
const PERA_WALLET_REDIRECT_MODAL_ID = "pera-wallet-redirect-modal-wrapper";

// The ID of the wrapper element for PeraWalletSignTxnToast
const PERA_WALLET_SIGN_TXN_TOAST_ID = "pera-wallet-sign-txn-toast-wrapper";

// The ID of the wrapper element for PeraWalletSignTxnModal
const PERA_WALLET_SIGN_TXN_MODAL_ID = "pera-wallet-sign-txn-modal-wrapper";

// The ID of the Pera wallet iframe
const PERA_WALLET_IFRAME_ID = "pera-wallet-iframe";

// The classname of Pera wallet modal
const PERA_WALLET_MODAL_CLASSNAME = "pera-wallet-modal";

// The classname of Web Wallet IFrame
const PERA_WALLET_WEB_WALLET_IFRAME_CLASSNAME =
  "pera-wallet-connect-modal-desktop-mode__web-wallet-iframe";

function createModalWrapperOnDOM(modalId: string) {
  const wrapper = document.createElement("div");

  wrapper.setAttribute("id", modalId);

  document.body.appendChild(wrapper);

  return wrapper;
}

function openPeraWalletConnectModal(modalConfig: PeraWalletModalConfig) {
  if (!document.getElementById(PERA_WALLET_CONNECT_MODAL_ID)) {
    const root = createModalWrapperOnDOM(PERA_WALLET_CONNECT_MODAL_ID);
    const {uri, isWebWalletAvailable, shouldDisplayNewBadge, shouldUseSound} =
      modalConfig;

    root.innerHTML = `<pera-wallet-connect-modal uri="${uri}" is-web-wallet-avaliable="${isWebWalletAvailable}" should-display-new-badge="${shouldDisplayNewBadge}" should-use-sound="${shouldUseSound}"></pera-wallet-connect-modal>`;
  }
}

/**
 * Creates a PeraWalletRedirectModal instance and renders it on the DOM.
 *
 * @returns {void}
 */
function openPeraWalletRedirectModal() {
  const root = createModalWrapperOnDOM(PERA_WALLET_REDIRECT_MODAL_ID);

  root.innerHTML = "<pera-wallet-redirect-modal></pera-wallet-redirect-modal>";
}

function openPeraWalletSignTxnModal() {
  const root = createModalWrapperOnDOM(PERA_WALLET_SIGN_TXN_MODAL_ID);

  root.innerHTML = "<pera-wallet-sign-txn-modal></pera-wallet-sign-txn-modal>";

  const signTxnModal = root.querySelector("pera-wallet-sign-txn-modal");

  return signTxnModal
    ? waitForElementCreatedAtShadowDOM(
        signTxnModal,
        "pera-wallet-sign-txn-modal__body__content"
      )
    : Promise.reject();
}

function closePeraWalletSignTxnModal(rejectPromise?: (error: any) => void) {
  removeModalWrapperFromDOM(PERA_WALLET_SIGN_TXN_MODAL_ID);

  if (rejectPromise) {
    rejectPromise(
      new PeraWalletConnectError(
        {
          type: "SIGN_TXN_CANCELLED"
        },
        "Transaction sign is cancelled"
      )
    );
  }
}

/**
 * Creates a PeraWalletSignTxnToast instance and renders it on the DOM.
 *
 * @returns {void}
 */
function openPeraWalletSignTxnToast() {
  const root = createModalWrapperOnDOM(PERA_WALLET_SIGN_TXN_TOAST_ID);

  root.innerHTML = "<pera-wallet-sign-txn-toast></pera-wallet-sign-txn-toast>";
}

function closePeraWalletSignTxnToast() {
  removeModalWrapperFromDOM(PERA_WALLET_SIGN_TXN_TOAST_ID);
}

function removeModalWrapperFromDOM(modalId: string) {
  const wrapper = document.getElementById(modalId);

  if (wrapper) {
    wrapper.remove();
  }
}

function renderQRCode(uri: string, isWebWalletAvailable: boolean) {
  // eslint-disable-next-line no-magic-numbers
  const size = isWebWalletAvailable ? 205 : 250;
  const peraWalletConnectModalDesktopMode = document
    .querySelector("pera-wallet-connect-modal")
    ?.shadowRoot?.querySelector("pera-wallet-modal-desktop-mode");

  if (uri && peraWalletConnectModalDesktopMode) {
    const qrCode = new QRCodeStyling({
      width: size,
      height: size,
      type: "svg",
      data: uri,
      image: PeraWalletLogoWithBlackBackground,
      dotsOptions: {
        color: "#000",
        type: "extra-rounded"
      },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 10
      },
      cornersSquareOptions: {type: "extra-rounded"},
      cornersDotOptions: {
        type: "dot"
      }
    });

    const qrWrapper = peraWalletConnectModalDesktopMode.shadowRoot?.getElementById(
      "pera-wallet-connect-modal-connect-qr-code"
    );

    if (qrWrapper) {
      qrWrapper.innerHTML = "";

      qrCode.append(qrWrapper);
    }
  }
}

export {
  PERA_WALLET_CONNECT_MODAL_ID,
  PERA_WALLET_REDIRECT_MODAL_ID,
  PERA_WALLET_SIGN_TXN_TOAST_ID,
  PERA_WALLET_SIGN_TXN_MODAL_ID,
  PERA_WALLET_MODAL_CLASSNAME,
  PERA_WALLET_WEB_WALLET_IFRAME_CLASSNAME,
  PERA_WALLET_IFRAME_ID,
  openPeraWalletConnectModal,
  openPeraWalletRedirectModal,
  openPeraWalletSignTxnToast,
  closePeraWalletSignTxnToast,
  removeModalWrapperFromDOM,
  openPeraWalletSignTxnModal,
  closePeraWalletSignTxnModal,
  renderQRCode
};

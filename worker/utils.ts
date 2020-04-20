export const str2buf = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0));
export const buf2str = (b: ArrayBufferLike) => String.fromCharCode(...new Uint8Array(b));
export const buf2hex = (b: ArrayBufferLike) =>
    Array.prototype.map.call(new Uint8Array(b), x => ('00' + x.toString(16)).slice(-2)).join('');
export const hex2buf = (s = '') => new Uint8Array((s.match(/[\da-f]{2}/gi) as string[]).map(h => parseInt(h, 16)));

export const base64 = {
    decode: (s: string) => str2buf(atob(s)),
    encode: (b: ArrayBufferLike) => btoa(buf2str(b)),
    decodeToString: (s: string) => atob(s),
    encodeString: (b: string) => btoa(b),
    RAWURL: {
        decode: (s: string) => base64.decode(s.replace(/-/g, '+').replace(/_/g, '/')),
        encode: (b: ArrayBufferLike) =>
            base64
                .encode(b)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, ''),
        decodeToString: (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/')),
        encodeString: (b: string) =>
            btoa(b)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, ''),
    },
};

export const parseCookie = (str: string) =>
    str
        .split(';')
        .map(v => v.split('='))
        .reduce((acc, v) => {
            acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
            return acc;
        }, <Record<string, string>>{});

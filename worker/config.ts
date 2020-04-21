import { GoogleDriveConfig } from './drive';
import { buf2hex, str2buf } from './utils';

const config: GoogleDriveConfig = {
    secret: '__SECRET__',
    accounts: Array.from(
        { length: 1000 },
        (_, i: number) => `https://gist.githubusercontent.com/__GIST_USER__/__GISTHASH_FOR_ACCOUNTS__/raw/${i + 1}`,
    ),
    accountRotation: 60,
    accountCandidates: 10,
    userURL: async (user: string) =>
        'https://gist.githubusercontent.com/__GIST_USER__/__GISTHASH_FOR_USERS__/raw/' +
        buf2hex(await crypto.subtle.digest('SHA-256', str2buf(config.secret + user))),
    static: async (pathname: string) =>
        'https://gist.githubusercontent.com/__GIST_USER__/__GISTHASH_FOR_STATIC__/raw' + pathname,
};

export default config;

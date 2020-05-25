import { GoogleDriveConfig } from './drive';
import { buf2hex, str2buf } from './utils';

declare const __ACCOUNTS_COUNT__: number;
declare const __ACCOUNT_ROTATION__: number;
declare const __ACCOUNT_CANDIDATES__: number;

const config: GoogleDriveConfig = {
    secret: '__SECRET__',
    accounts: Array.from({ length: __ACCOUNTS_COUNT__ }, (_, i: number) => `__ACCOUNTS_URL__${i + 1}`),
    accountRotation: __ACCOUNT_ROTATION__,
    accountCandidates: __ACCOUNT_CANDIDATES__,
    userURL: async (user: string) =>
        '__USERS_URL__' + buf2hex(await crypto.subtle.digest('SHA-256', str2buf(config.secret + user))),
    static: async (pathname: string) => '__STATIC_URL__' + pathname,
};

export default config;

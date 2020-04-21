import { GoogleDriveConfig } from './drive';
import { buf2hex, str2buf } from './utils';

const config: GoogleDriveConfig = {
    secret: '__SECRET__',
    accounts: Array.from({ length: 1000 }, (_, i: number) => `__ACCOUNTS_URL__${i + 1}`),
    accountRotation: 60,
    accountCandidates: 10,
    userURL: async (user: string) =>
        '__USERS_URL__' + buf2hex(await crypto.subtle.digest('SHA-256', str2buf(config.secret + user))),
    static: async (pathname: string) => '__STATIC_URL__' + pathname,
};

export default config;

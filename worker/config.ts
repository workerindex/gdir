import { GoogleDriveConfig } from './drive';
import { buf2hex, str2buf } from './utils';

const config: GoogleDriveConfig = {
    secret: 'highly secure and confidential random string that no one can ever guess!!!',
    accounts: Array.from(
        { length: 1000 /* Set how many accounts you have here! */ },
        (_, i: number) => `https://gist.githubusercontent.com/<USERNAME>/<GISTHASH_FOR_ACCOUNTS>/raw/${i + 1}`,
    ),
    accountRotationWindow: 10,
    userURL: async (user: string) =>
        'https://gist.githubusercontent.com/<USERNAME>/<GISTHASH_FOR_USERS>/raw/' +
        buf2hex(await crypto.subtle.digest('SHA-256', str2buf(config.secret + user))),
    static: async (pathname: string) =>
        'https://gist.githubusercontent.com/<USERNAME>/<GISTHASH_FOR_STATIC>/raw' + pathname,
};

export default config;

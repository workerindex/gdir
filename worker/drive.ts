import { base64, str2buf, buf2str } from './utils';

export interface AccessToken {
    expires?: number;
    access_token?: string;
}

export interface GoogleDriveUserAccount extends AccessToken {
    type: 'authorized_user';

    // User Credential fields
    // (These typically come from gcloud auth.)
    client_id: string;
    client_secret: string;
    refresh_token: string;
}

export interface GoogleDriveServiceAccount extends AccessToken {
    type: 'service_account';

    // Service Account fields
    client_email: string;
    private_key_id: string;
    private_key: string;
    token_uri: string;
    project_id: string;
}

export type GoogleDriveAccount = GoogleDriveUserAccount | GoogleDriveServiceAccount;

export interface GoogleDriveConfig {
    // secure random string that provides app-level security
    secret: string;
    accountRotation: number;
    accountCandidates: number;
    accounts: (GoogleDriveAccount | string)[];
    userURL: (user: string) => Promise<string>;
    static: (pathname: string) => Promise<string>;
}

interface TokenResponse {
    access_token: string;
    token_type: string;
    refresh_token: string;
    expires_in: number;
}

interface GDFileList {
    nextPageToken?: string;
    files: any;
    drives: any;
}

export interface User {
    name: string;
    pass: string;
    drives_white_list?: string[];
    drives_black_list?: string[];
}

export class GoogleDrive {
    constructor(private config: GoogleDriveConfig) {}

    async getUser(user: string): Promise<User> {
        return JSON.parse(
            buf2str(await this.decrypt('user', await (await fetch(await this.config.userURL(user))).arrayBuffer())),
        );
    }

    async download(account: GoogleDriveAccount | null, id: string, range = ''): Promise<Response> {
        const url = new URL(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);

        if (account == null) {
            account = await this.pickAccount();
        }

        return fetch(url.toString(), {
            headers: {
                Range: range,
                Authorization: `Bearer ${await this.accessToken(account)}`,
            },
        });
    }

    async file(account: GoogleDriveAccount | null, id: string): Promise<any> {
        if (account == null) {
            account = await this.pickAccount();
        }
        const token = await this.accessToken(account);
        const [file, drive] = await Promise.all([
            (async () => {
                const url = new URL(`https://www.googleapis.com/drive/v3/files/${id}`);
                url.searchParams.set('supportsAllDrives', 'true');
                url.searchParams.set('fields', 'id,name,kind,mimeType,size,modifiedTime,parents,md5Checksum');
                return (
                    await fetch(url.toString(), {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    })
                ).json();
            })(),
            (async () => {
                const url = new URL(`https://www.googleapis.com/drive/v3/drives/${id}`);
                url.searchParams.set('fields', 'id,name,kind');
                return (
                    await fetch(url.toString(), {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    })
                ).json();
            })(),
        ]);

        if (!drive.error) {
            file.kind = drive.kind;
            file.name = drive.name;
        }

        return file;
    }

    async ls(
        account: GoogleDriveAccount | null,
        parent?: string | null,
        orderBy?: string | null,
        encrypted_page_token?: string | null,
    ): Promise<GDFileList | null> {
        let pageToken: string | undefined;

        if (account == null && typeof encrypted_page_token === 'string' && encrypted_page_token !== '') {
            const data = JSON.parse(
                buf2str(await this.decrypt('pageToken', base64.RAWURL.decode(encrypted_page_token))),
            );
            account = data.account;
            pageToken = data.pageToken;
        }

        if (account == null) {
            account = await this.pickAccount();
        }

        let url: URL;

        if (parent) {
            url = new URL('https://www.googleapis.com/drive/v3/files');
            url.searchParams.set('includeItemsFromAllDrives', 'true');
            url.searchParams.set('supportsAllDrives', 'true');
            url.searchParams.set('q', `'${parent}' in parents and trashed = false`);
            url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,modifiedTime)');
            url.searchParams.set('pageSize', '100');
            if (orderBy) {
                url.searchParams.set('orderBy', orderBy);
            } else {
                url.searchParams.set('orderBy', 'folder,name,modifiedTime desc');
            }
        } else {
            url = new URL('https://www.googleapis.com/drive/v3/drives');
            url.searchParams.set('pageSize', '100');
        }
        if (pageToken) {
            url.searchParams.set('pageToken', pageToken);
        }

        const response = await (
            await fetch(url.toString(), {
                headers: {
                    Authorization: `Bearer ${await this.accessToken(account)}`,
                },
            })
        ).json();

        let nextPageToken: string | undefined;
        if (response.nextPageToken) {
            nextPageToken = base64.RAWURL.encode(
                await this.encrypt(
                    'pageToken',
                    JSON.stringify({
                        account,
                        pageToken: response.nextPageToken,
                    }),
                ),
            );
        }

        return {
            nextPageToken,
            files: response.files,
            drives: response.drives,
        };
    }

    async secretKey(namespace: string): Promise<CryptoKey> {
        const {
            config: { secret },
        } = this;
        return crypto.subtle.importKey(
            'raw',
            await crypto.subtle.digest('SHA-256', str2buf(secret + ':' + namespace)),
            'AES-GCM',
            true,
            ['encrypt', 'decrypt'],
        );
    }

    async encrypt(namespace: string, data: string | ArrayBufferLike): Promise<ArrayBuffer> {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = new Uint8Array(
            await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                await this.secretKey(namespace),
                typeof data === 'string' ? str2buf(data) : new Uint8Array(data),
            ),
        );
        const packed = new Uint8Array(12 + ciphertext.byteLength);
        packed.set(iv);
        packed.set(ciphertext, 12);
        return packed;
    }

    async decrypt(namespace: string, data: string | ArrayBufferLike): Promise<ArrayBuffer> {
        if (typeof data === 'string') {
            data = base64.decode(data);
        }
        if (!(data instanceof Uint8Array)) {
            data = new Uint8Array(data);
        }
        const iv = new Uint8Array((data as Uint8Array).buffer, 0, 12);
        const ciphertext = new Uint8Array((data as Uint8Array).buffer, 12);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await this.secretKey(namespace), ciphertext);
    }

    async pickAccount(): Promise<GoogleDriveAccount> {
        const {
            config: { secret, accounts, accountRotation, accountCandidates },
        } = this;
        const candidates: typeof accounts = [];
        if (accounts.length <= accountCandidates) {
            candidates.push(...accounts);
        } else {
            // new seed for every accountRotation seconds
            const seed = secret + Math.floor(Date.now() / 1000 / accountRotation).toString();
            // generate a random value from seed
            const rand = new Uint32Array(await crypto.subtle.digest('SHA-256', str2buf(seed)))[0];
            // use the seeded random value as starting point, select accountCandidates consecutive accounts
            for (let i = rand % accounts.length, j = 0; j < accountCandidates; i = (i + 1) % accounts.length, ++j) {
                candidates.push(accounts[i]);
            }
        }
        // choose randomly without seed, an item from the candidates
        const account = candidates[Math.floor(Math.random() * candidates.length)];
        if (typeof account === 'string') {
            const ciphertext = await (await fetch(account)).arrayBuffer();
            const plaintext = buf2str(await this.decrypt('account', ciphertext));
            return JSON.parse(plaintext);
        } else {
            return account;
        }
    }

    async accessToken(account: GoogleDriveAccount): Promise<string> {
        if (account.expires == undefined || account.expires < Date.now()) {
            let token: TokenResponse;
            if (account.type == 'authorized_user') {
                token = await this.fetchOauth2Token(account);
            } else {
                token = await this.fetchJwtToken(account);
            }
            if (token.access_token != undefined) {
                account.access_token = token.access_token;
                account.expires = Date.now() + Math.max(0, token.expires_in - 100) * 1000;
            }
        }
        return account.access_token as string;
    }

    async fetchOauth2Token(account: GoogleDriveUserAccount): Promise<TokenResponse> {
        const url = new URL('https://oauth2.googleapis.com/token');
        const form = new URLSearchParams();
        form.set('client_id', account.client_id);
        form.set('client_secret', account.client_secret);
        form.set('refresh_token', account.refresh_token);
        form.set('grant_type', 'refresh_token');
        return (
            await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: form.toString(),
            })
        ).json();
    }

    async fetchJwtToken(account: GoogleDriveServiceAccount): Promise<TokenResponse> {
        const headers = {
            alg: 'RS256',
            typ: 'JWT',
            kid: account.private_key_id,
        };
        const now = Math.floor(Date.now() / 1000) - 10;
        const claimSet = {
            iat: now,
            exp: now + 3600,
            iss: account.client_email,
            aud: account.token_uri,
            scope: 'https://www.googleapis.com/auth/drive',
        };
        const body =
            base64.RAWURL.encodeString(JSON.stringify(headers)) +
            '.' +
            base64.RAWURL.encodeString(JSON.stringify(claimSet));
        const privateKey = await this.importRSAPEMPrivateKey(account.private_key);
        const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, str2buf(body));
        const jws = body + '.' + base64.encode(sig);
        const url = new URL('https://oauth2.googleapis.com/token');
        const form = new URLSearchParams();
        form.set('assertion', jws);
        form.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        return (
            await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: form.toString(),
            })
        ).json();
    }

    async importRSAPEMPrivateKey(pem: string): Promise<CryptoKey> {
        // fetch the part of the PEM string between header and footer
        const pemHeader = '-----BEGIN PRIVATE KEY-----';
        const pemFooter = '-----END PRIVATE KEY-----';
        const lines = pem.split(/[\r\n]+/);
        let pemContent = '';
        let inContent = false;
        for (let line of lines) {
            line = line.trim();
            if (inContent) {
                if (line === pemFooter) {
                    break;
                }
                pemContent += line;
            } else if (line === pemHeader) {
                inContent = true;
            }
        }
        const binaryDer = base64.decode(pemContent);

        return crypto.subtle.importKey(
            'pkcs8',
            binaryDer,
            {
                name: 'RSASSA-PKCS1-v1_5',
                hash: 'SHA-256',
            },
            true,
            ['sign'],
        );
    }
}
